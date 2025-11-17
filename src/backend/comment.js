// Enhanced comment processor for boost detection
export async function onIssueCommented(event, context) {
    try {
        console.log('🔔 onIssueCommented triggered - TESTING COMMENT TRIGGER');
        console.log('📋 Full event data:', JSON.stringify(event, null, 2));
        console.log('📋 Full context data:', JSON.stringify(context, null, 2));

        // Extract key information from the event

        const commentId = event?.comment?.id;
        const issueKey = event?.issue?.key;
        // Pass the full ADF body; the extractor will handle both doc and array
        const commentBody = event?.comment?.body;
        const authorAccountId = event?.comment?.author?.accountId;
        const mentionedAccountIds = event?.mentionedAccountIds || [];

        console.log('🗨️ Comment created event received', {
            commentId,
            authorAccountId,
            mentionedUsers: mentionedAccountIds.length,
            eventType: event?.eventType
        });

        // Extract text content from ADF (Atlassian Document Format)
        const commentText = extractTextFromADF(commentBody);
        console.log('📝 Comment text:', commentText);

        // TEST: Always process any comment to see if trigger is working
        console.log('🧪 TESTING: Processing ANY comment to verify trigger is working');

        // Fire boost only when comment includes a rocket and there are mentions
        if (commentText?.includes('🚀') && (mentionedAccountIds?.length || 0) > 0) {
            await processBoostFromComment({
                issueKey,
                commentId,
                commentText,
                authorAccountId,
                mentionedAccountIds,
                context
            });
        } else {
            console.log('ℹ️ No rocket emoji or no mentioned users; skipping boost');
        }

        return { ok: true };
    } catch (e) {
        console.error('❌ Error in onIssueCommented:', e);
        return { ok: false, error: e.message };
    }
}

// Extract plain text from ADF (Atlassian Document Format)
function extractTextFromADF(adfBody) {
    if (!adfBody) return '';

    // Support either a full ADF doc ({ type: 'doc', content: [...] }) or the content array directly
    const rootContent = Array.isArray(adfBody) ? adfBody : adfBody.content;
    if (!Array.isArray(rootContent)) return '';

    let text = '';

    function traverseContent(content) {
        if (!Array.isArray(content)) return;
        content.forEach(item => {
            if (item.type === 'text') {
                text += item.text || '';
            } else if (item.type === 'emoji') {
                text += item.attrs?.text || '';
            } else if (item.type === 'mention') {
                // Ignore mentions: keep only plain text and emoji
            } else if (item.content) {
                traverseContent(item.content);
            }
        });
    }

    traverseContent(rootContent);
    return text.trim();
}

// Detect boost-related triggers in comment text

// Process boost from comment
async function processBoostFromComment({ issueKey, commentId, commentText, authorAccountId, mentionedAccountIds, context }) {
    try {
        console.log('🎯 Processing boost from comment...', context?.installation?.contexts[0]?.cloudId);

        const cloudId = context?.installation?.contexts[0]?.cloudId || 'unknown-cloud';
        console.log('☁️ Cloud ID:', cloudId);
        const receivers = Array.isArray(mentionedAccountIds) ? mentionedAccountIds.filter(Boolean) : [];
        if (receivers.length === 0) {
            console.log('⚠️ No valid receivers found; aborting boost');
            return;
        }

        const boostAmount = 1;

        const payload = {
            provider: 'jira',
            teamId: cloudId,
            actorAccountId: authorAccountId,
            receivers: receivers,
            boostAmount: boostAmount,
            message: commentText,
            context: {
                triggerType: 'comment_boost',
                issueKey,
                commentId
            }
        };

        console.log('📤 Sending Jira boost payload to backend:', payload);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        try {
            const response = await global.fetch('https://https://staging-be.rewardify.ai/integrations/jira/boosts', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Integration-Token': 'default-token'
                },
                body: JSON.stringify(payload),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (response.ok) {
                const result = await response.json();
                console.log('✅ Jira boost processed successfully:', {
                    receivers: receivers.length,
                    issueKey,
                    result
                });
            } else {
                const errorText = await response.text();
                console.error('❌ Backend Jira boost error:', {
                    status: response.status,
                    error: errorText,
                    issueKey
                });
            }
        } catch (error) {
            clearTimeout(timeoutId);
            console.error('❌ Error sending Jira boost:', {
                error: error.message,
                issueKey
            });
        }

    } catch (error) {
        console.error('❌ Error processing boost:', {
            error: error.message,
            issueKey: issueKey
        });
    }
}
