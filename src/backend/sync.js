// Note: @forge/api and @forge/bridge are not available in resolver context
// We need to use a different approach for resolvers

const siteKey = (context) => {
    const cid = context?.cloudId ?? 'unknown-cloud';
    const iid =
        context?.installation?.id ??
        context?.installContext?.installationId ??
        'unknown-install';
    return `users:${cid}:${iid}`;
};

// Note: Backend functions cannot call Jira API directly
// The actual Jira API calls must be done from frontend context

async function storeUsers(context) {
    const base = siteKey(context);
    // Note: Storage API not available in resolver context
    // await storage.delete(`${base}:meta`);

    // For now, just return a simple meta object
    // The actual user fetching will be done from frontend
    const meta = {
        total: 0,
        pages: 0,
        lastSyncAt: new Date().toISOString()
    };

    console.log('📊 Store users called (storage not available in resolver context)');
    return meta;
}

export async function handleInstalled(event, context) {
    console.log('✅ handleInstalled -> syncing users', { cloudId: context?.cloudId }, event);
    const response = await global.fetch('https://staging-be.rewardify.ai/integrations/jira/installation', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Integration-Token': 'default-token'
        },
        body: JSON.stringify(event)
    });

    if (response.ok) {
        const result = await response.json();
        console.log('✅ Installation data sent to backend:', result);
        return { success: true, data: result };
    } else {
        const errorText = await response.text();
        console.error('❌ Backend installation error:', response.status, errorText);
        return { success: false, error: `Backend error: ${response.status} - ${errorText}` };
    }
    // const meta = await storeUsers(context);
    console.log('✅ user sync complete', meta);
    return { ok: true };
}

export async function syncAllUsers(_event, context) {
    console.log('🕰️ scheduled sync -> syncing users');
    const meta = await storeUsers(context);
    console.log('✅ scheduled user sync complete', meta);
    return { ok: true, synced: meta };
}
