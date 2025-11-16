import React, { useEffect, useState } from 'react';
import ForgeReconciler, {
  Text,
  Button,
  LoadingButton,
  Textfield,
  Heading,
  Spinner,
  Stack,
  Box,
  Icon,
  SectionMessage,
  Lozenge,
  Modal,
  ModalBody,
  ModalHeader,
  ModalTitle,
  ModalFooter,
  UserPicker,
  Select,
  Strong,
  xcss,
} from '@forge/react';
import { invoke, requestJira } from '@forge/bridge';

// const App = () => {
//   const [data, setData] = useState(null);
// useEffect(() => {
//   invoke('getText', { example: 'my-invoke-variable' }).then(setData);
// }, []);
// return (
// <>
//   <Text>Hello world!</Text>
//   <Text>{data ? data : 'Loading...'}</Text>
// </>
// );
// };

const cardStyle = xcss({
  backgroundColor: 'color.background.neutral',
  padding: 'space.300',
});

const gradientHeader = xcss({
  padding: 'space.400',
});

// Removed invalid xcss properties - using default button styles
const featureCard = xcss({
  backgroundColor: 'color.background.neutral.subtle',
  padding: 'space.300',
});

const vertical20 = xcss({ marginBlock: 'space.250' });
const horizontal20 = xcss({ marginInline: 'space.250' });
const App = () => {
  const [loading, setLoading] = useState(false);
  const [givingBoost, setGivingBoost] = useState(false);
  const [message, setMessage] = useState('');
  const [users, setUsers] = useState([]);
  const [data, setData] = useState(null);
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedRecipient, setSelectedRecipient] = useState(null);
  const [selectedBoostAmount, setSelectedBoostAmount] = useState(null);
  const [cloudId, setCloudId] = useState(null);

  // Get cloudId on component mount (needed for UserPicker)
  useEffect(() => {
    const getCloudId = async () => {
      try {
        const meResp = await requestJira('/rest/api/3/myself', {
          headers: { Accept: 'application/json' },
        });
        if (meResp.ok) {
          const me = await meResp.json();
          if (typeof me.self === 'string') {
            const m = me.self.match(/\/ex\/jira\/([^/]+)\//);
            if (m) {
              setCloudId(m[1]);
            }
          }
        }
      } catch (e) {
        console.error('Error getting cloudId:', e);
      }
    };
    getCloudId();
  }, []);
  useEffect(() => {
    invoke('getText', { example: 'my-invoke-variable' }).then(setData);
  }, []);
  const handleGiveBoost = async () => {
    if (!selectedRecipient) {
      setMessage('Please select a recipient');
      return;
    }
    if (!selectedBoostAmount) {
      setMessage('Please select a boost amount');
      return;
    }
    if (!cloudId) {
      setMessage('Cloud ID not available. Please refresh the page.');
      return;
    }

    try {
      setGivingBoost(true);
      setMessage('');

      // Get current user for the boost
      const meResp = await requestJira('/rest/api/3/myself', {
        headers: { Accept: 'application/json' },
      });
      if (!meResp.ok) {
        throw new Error('Failed to get current user');
      }
      const me = await meResp.json();

      const boostCount = parseInt(selectedBoostAmount);
      const res = await invoke('giveBoost', {
        recipientAccountId: selectedRecipient.accountId,
        recipientName: selectedRecipient.displayName || selectedRecipient.name,
        message: `🚀 You earned ${boostCount} boost${
          boostCount > 1 ? 's' : ''
        }!`,
        cloudId: cloudId,
        actor: me.accountId,
        tempBoosts: boostCount,
      });

      if (res.success) {
        setMessage(
          res.message ||
            `✅ ${boostCount} boost${boostCount > 1 ? 's' : ''} sent!`
        );
        setSelectedRecipient(null);
        setSelectedBoostAmount(null);
        setIsModalOpen(false);
      } else {
        setMessage(`❌ ${res.error}`);
      }
    } catch (e) {
      setMessage(`❌ Error sending boost: ${e.message}`);
    } finally {
      setGivingBoost(false);
    }
  };

  const handleOpenModal = async () => {
    setIsModalOpen(true);
    setMessage('');
    // const res = await invoke('getUserEmail', { example: 'my-invoke-variable' });
    // console.log('User email response:', res);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedRecipient(null);
    setSelectedBoostAmount(null);
  };

  // Removed loadUserStats; relying on loadBoostData only

  // const WEBTRIGGER_URL =
  //   'https://148f729d-eda9-4539-9c68-9471f592a87f.hello.atlassian-dev.net/x1/o7BbgVfVsH04-eFtGP2w2zKhNDg';

  // async function fetchJiraUsers(page = 0) {
  //   setMessage('👥 Fetching Jira users...');
  //   const resp = await fetch(`${WEBTRIGGER_URL}?page=${page}`);
  //   const json = await resp.json();
  //   console.log('Fetched users response:', json);
  //   if (json.success) {
  //     const { users, totalCount, pages, page, lastSyncAt } = json.data;
  //     // ...update state with users & meta...
  //   } else {
  //     setMessage(`❌ ${json.error || 'Error fetching users'}`);
  //   }
  // }

  const syncUsersToBackend = async () => {
    try {
      setMessage(
        '🔄 Fetching all users from Jira API (this may take a minute)…'
      );
      setLoading(true);
      const syncResult = await invoke('syncUsersToBackend', { cloudId });
      if (syncResult?.success) {
        console.log('✅ Users synced to backend successfully', syncResult);
        users.length;
        setMessage(
          `✅ ${
            syncResult.message ||
            `Successfully synced ${userCount} users to backend!`
          }`
        );
        console.log('✅ Backend sync result:', syncResult);
      } else {
        setMessage(
          `❌ Backend sync failed: ${syncResult?.error || 'unknown error'}`
        );
      }
    } catch (e) {
      console.error('❌ Error syncing users to backend:', e);
      setMessage(`❌ Error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };
  return (
    <Stack space='space.400'>
      {/* Beautiful Header */}
      {/* Status Messages */}
      {message && (
        <SectionMessage
          appearance={
            message.includes('✅')
              ? 'success'
              : message.includes('❌')
              ? 'error'
              : 'info'
          }
          title={
            message.includes('✅')
              ? 'Success'
              : message.includes('❌')
              ? 'Error'
              : 'Info'
          }
        >
          <Text>{message}</Text>
        </SectionMessage>
      )}

      {/* Buttons Section */}
      <Box xcss={cardStyle}>
        <Stack space='space.200'>
          <Button appearance='primary' onClick={syncUsersToBackend} isFullWidth>
            <Icon name='upload' size='small' />
            <Text xcss={horizontal20}>Sync Users</Text>
          </Button>

          <Button appearance='primary' onClick={handleOpenModal} isFullWidth>
            <Icon name='send' size='small' />
            <Text xcss={horizontal20}>🚀 Send Boost</Text>
          </Button>
        </Stack>

        {/* User List Preview */}
        {users.length > 0 && (
          <Box marginTop='space.300'>
            <Heading size='small' marginBottom='space.200'>
              <Icon name='user' size='small' />
              <Text xcss={horizontal20}>Recent Users ({users.length})</Text>
            </Heading>
            <Stack space='space.100'>
              {users.slice(0, 5).map((u) => (
                <Box key={u.accountId} xcss={featureCard}>
                  <Stack
                    space='space.100'
                    direction='horizontal'
                    alignBlock='center'
                  >
                    <Icon name='person' size='small' />
                    <Text size='small'>{u.displayName}</Text>
                    <Lozenge
                      appearance='neutral'
                      text={u.accountId.slice(0, 8)}
                    />
                  </Stack>
                </Box>
              ))}
              {users.length > 5 && (
                <Text size='small' color='color.text.subtle'>
                  …and {users.length - 5} more users
                </Text>
              )}
            </Stack>
          </Box>
        )}
      </Box>

      {/* Send Boost Modal */}
      {isModalOpen && (
        <Modal onClose={handleCloseModal}>
          <ModalHeader>
            <ModalTitle>Send Boosts 🚀</ModalTitle>
          </ModalHeader>
          <ModalBody>
            <Stack space='space.400'>
              {/* Recipient Selector */}
              <Box>
                <Text>
                  <Strong>Recipient</Strong>
                </Text>
                <Box marginTop='space.200'>
                  {cloudId ? (
                    <UserPicker
                      cloudId={cloudId}
                      onChange={(users) => {
                        if (users && users.length > 0) {
                          setSelectedRecipient(users[0]);
                        } else {
                          setSelectedRecipient(null);
                        }
                      }}
                      value={selectedRecipient ? [selectedRecipient] : []}
                      placeholder='Select co-workers'
                    />
                  ) : (
                    <Text>Loading user picker...</Text>
                  )}
                </Box>
              </Box>

              {/* Boost Amount Selector */}
              <Box>
                <Text>
                  <Strong>Boost</Strong>
                </Text>
                <Box marginTop='space.200'>
                  <Select
                    placeholder='🚀 Select Boost'
                    options={[
                      { label: '+1 Boost', value: '1' },
                      { label: '+2 Boost', value: '2' },
                      { label: '+3 Boost', value: '3' },
                    ]}
                    onChange={(option) => setSelectedBoostAmount(option.value)}
                    value={
                      selectedBoostAmount
                        ? {
                            label: `+${selectedBoostAmount} Boost`,
                            value: selectedBoostAmount,
                          }
                        : null
                    }
                  />
                </Box>
              </Box>
            </Stack>
          </ModalBody>
          <ModalFooter>
            <Button appearance='subtle' onClick={handleCloseModal}>
              Cancel
            </Button>
            <LoadingButton
              appearance='primary'
              onClick={handleGiveBoost}
              isLoading={givingBoost}
              isDisabled={!selectedRecipient || !selectedBoostAmount}
            >
              Send Rewards
            </LoadingButton>
          </ModalFooter>
        </Modal>
      )}
    </Stack>
  );
};
ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
