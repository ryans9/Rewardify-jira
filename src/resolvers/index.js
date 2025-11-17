import Resolver from '@forge/resolver';
import api, { route } from "@forge/api";
const resolver = new Resolver();

resolver.define('getText', (req) => {
  console.log(req);
  return 'Hello, world!';
});



const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Safe request helper with retries.
 */
async function safeRequest(url, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    const res = await api.asApp().requestJira(url);
    if (res.ok) return res;

    if (i === retries) {
      const txt = await res.text();
      throw new Error(`Jira API failed ${res.status}: ${txt}`);
    }
    await sleep(120);
  }
}

/**
 * Fetches full user details + email (safe, rate-limit protected).
 */
async function fetchUserEmail(user) {
  try {
    console.log('Fetching email for user:', user.accountId);
    // Primary fetch: details (may include email)
    // const res = await safeRequest(
    //   route`/rest/api/3/user?accountId=${encodeURIComponent(
    //     user.accountId
    //   )}&expand=groups,applicationRoles`
    // );

    // const details = await res.json();
    // let email = details.emailAddress || null;
    let email = ''
    // console.log('Fetched email from user details:--------', user);
    // If email still missing, hit the email endpoint
    if (user) {
      // const eRes = await api.asApp().requestJira(
      //   route`/rest/api/3/user/email?accountId=${encodeURIComponent(
      //     user.accountId
      //   )}`
      // );
      const eRes = await api.asApp().requestJira(
        route`/rest/api/3/user/email?accountId=${user.accountId}`
      );
      console.log('Email endpoint response status:', eRes);
      if (eRes.ok) {
        const eData = await eRes.json();
        console.log('Fetched email from email endpoint:--------', eData);
        email = eData.email || null;
      }
    }

    return {
      ...user,
      emailAddress: email,
      // groups: details.groups,
      // applicationRoles: details.applicationRoles,
    };
  } catch (err) {
    console.warn(`⚠ Failed to fetch email for ${user.displayName}`, err);
    return user; // still return base user info
  }
}

/**
 * 🚀 MAIN OPTIMIZED FUNCTION
 */
export async function fetchAllRealUsersWithEmails(maxUsers = 5000) {
  let startAt = 0;
  const pageSize = 1000;
  const allUsers = [];

  console.log("▶ Fetching all real Atlassian users…");

  // STEP 1 — Fetch every Atlassian user in pages
  while (true) {
    const res = await safeRequest(
      route`/rest/api/3/users/search?accountType=atlassian&startAt=${startAt}&maxResults=${pageSize}`
    );

    const page = await res.json();
    if (!page.length) break;

    // Only keep real, active Atlassian users
    const humans = page.filter(
      (u) => u.active && u.accountType === "atlassian"
    );

    allUsers.push(...humans);

    if (page.length < pageSize || allUsers.length >= maxUsers) break;

    startAt += page.length;
  }

  const limitedUsers = allUsers.slice(0, maxUsers);

  console.log(`✔ Found ${limitedUsers} active users`);
  console.log("▶ Fetching email addresses…");

  // STEP 2 — Fetch emails in batches to avoid rate limits
  const enrichedUsers = [];
  const batchSize = 5; // safe for Jira API limits

  for (let i = 0; i < limitedUsers.length; i++) {

    const results = await fetchUserEmail(limitedUsers[i]);

    enrichedUsers.push(results);

    // Avoid Jira rate limits
    await sleep(150);
  }


  return enrichedUsers;
}



resolver.define("getUserEmail", async (req) => {
  try {
    // Logged-in user's Atlassian accountId
    console.log("Request context:", req.context);
    const accountId = req.context.accountId;

    const response = await api.asApp().requestJira(
      route`/rest/api/3/user/email?accountId=${accountId}`
    );

    const data = await response.json();
    console.log(data);

    return {
      email: data.emailAddress || null,
      ok: true,
      data: data,
      accountId: accountId,
    };

  } catch (err) {
    console.error("Error fetching user email:", err);
    return {
      ok: false,
      error: err.message
    };
  }
});

resolver.define('syncUsersToBackend', async (req) => {
  try {
    console.log('🔄 Starting user sync to backend...');
    const { cloudId } = req.payload || {};
    const users = await fetchAllRealUsersWithEmails();
    if (!users || !Array.isArray(users)) {
      return {
        success: false,
        error: 'No users provided in payload'
      };
    }

    console.log(`📊 Syncing ${users.length} users to backend...`);
    console.log(`🔍 CloudId: ${cloudId || 'not provided'}`);
    console.log(`📋 Users array type: ${Array.isArray(users) ? 'Array' : typeof users}`);
    console.log(`📋 Users array length: ${users.length}`);
    if (users.length > 0) {
      console.log(`📋 First 3 users:`, users.slice(0, 3).map(u => ({
        accountId: u.accountId,
        displayName: u.displayName,
        email: u.emailAddress,
        hasGroups: !!(u.groups && u.groups.items),
        hasApplicationRoles: !!(u.applicationRoles && u.applicationRoles.items)
      })));
    } else {
      console.log(`⚠️ Users array is empty!`);
    }

    const enrichedUsers = users;

    // Send users to your backend with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout for large syncs

    const response = await global.fetch('https://https://staging-be.rewardify.ai/integrations/jira/sync-users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Integration-Token': 'default-token'
      },
      body: JSON.stringify({
        users: enrichedUsers,
        cloudId: cloudId,
        syncTime: new Date().toISOString(),
        source: 'forge-app'
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const result = await response.json();
      console.log('✅ Users synced to backend successfully:', result);
      return {
        success: true,
        message: `Successfully synced ${enrichedUsers.length} users to backend`,
        data: result
      };
    } else {
      const errorText = await response.text();
      console.error('❌ Backend sync error:', response.status, errorText);
      return {
        success: false,
        error: `Backend error: ${response.status} - ${errorText}`
      };
    }
  } catch (error) {
    console.error('❌ Error syncing users to backend:', error);
    if (error.name === 'AbortError') {
      return {
        success: false,
        error: 'Request timed out - backend may be slow or unavailable'
      };
    }
    return {
      success: false,
      error: error.message
    };
  }
});


resolver.define('getIssueContext', async (req) => {
  try {
    // Get issue key from resolver context
    const context = req.context;
    const issueKey = context?.extension?.issue?.key ||
      context?.platformContext?.issueKey ||
      context?.issue?.key ||
      null;

    return {
      success: true,
      issueKey: issueKey
    };
  } catch (error) {
    console.error('Error getting issue context:', error);
    return {
      success: false,
      issueKey: null
    };
  }
});

resolver.define('getHumanUsers', async (req) => {
  try {
    const { cloudId } = req.payload || {};
    console.log('🔍 Fetching human users for cloudId:', cloudId);

    // Fetch only human users (accountType === 'atlassian' and active)
    const users = await fetchAllRealUsersWithEmails(1000); // Limit to 1000 for performance

    // Filter to ensure only human users (double-check)
    const humanUsers = users.filter(
      (u) => u.active && u.accountType === "atlassian"
    );

    console.log(`✔ Found ${humanUsers.length} human users`);

    // Format for Select component
    const formattedUsers = humanUsers.map((user) => ({
      label: user.displayName || user.emailAddress || 'Unknown User',
      value: user.accountId,
      accountId: user.accountId,
      displayName: user.displayName,
      emailAddress: user.emailAddress,
      avatarUrl: user.avatarUrls?.['48x48'] || null,
    }));

    return {
      success: true,
      users: formattedUsers,
      count: formattedUsers.length
    };
  } catch (error) {
    console.error('❌ Error fetching human users:', error);
    return {
      success: false,
      error: error.message,
      users: []
    };
  }
});

resolver.define('giveBoost', async (req) => {
  try {
    console.log('📥 Received giveBoost request:', JSON.stringify(req, null, 2));
    console.log('📥 Request payload:', JSON.stringify(req.payload, null, 2));

    const { cloudId, actorAccountId, receivers, boostAmount, message, issueKey } = req.payload || {};

    console.log('📥 Extracted values:', {
      cloudId,
      actorAccountId,
      receivers,
      boostAmount,
      message,
      issueKey,
      receiversType: typeof receivers,
      receiversIsArray: Array.isArray(receivers)
    });

    // Validate required fields
    if (!cloudId || !actorAccountId || !receivers || !Array.isArray(receivers) || receivers.length === 0) {
      console.error('❌ Validation failed:', {
        hasCloudId: !!cloudId,
        hasActorAccountId: !!actorAccountId,
        hasReceivers: !!receivers,
        receiversIsArray: Array.isArray(receivers),
        receiversLength: receivers?.length
      });
      return {
        success: false,
        error: 'Missing required fields: cloudId, actorAccountId, and receivers array must be provided'
      };
    }

    // Format payload to match comment boost format
    const payload = {
      provider: 'jira',
      teamId: cloudId,
      actorAccountId: actorAccountId,
      receivers: receivers,
      boostAmount: boostAmount || 1,
      message: message || '🚀',
      context: {
        triggerType: 'manual_boost',
        issueKey: issueKey || null,
        commentId: null
      }
    };

    console.log('📤 Sending boost payload from modal:', payload);

    // Add timeout to prevent hanging
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout

    const resp = await global.fetch('https://https://staging-be.rewardify.ai/integrations/jira/boosts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Integration-Token': 'default-token' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!resp.ok) {
      const txt = await resp.text();
      console.error('❌ Backend boost error:', resp.status, txt);
      return { success: false, error: `Backend error: ${resp.status} - ${txt}` };
    }
    const data = await resp.json();
    console.log('✅ Boost sent successfully:', data);
    return { success: true, message: `Boost sent successfully!`, data };
  } catch (error) {
    if (error.name === 'AbortError') {
      return { success: false, error: 'Request timed out - backend may be slow or unavailable' };
    }
    console.error('❌ Error sending boost:', error);
    return { success: false, error: error.message };
  }
});
export const handler = resolver.getDefinitions();
