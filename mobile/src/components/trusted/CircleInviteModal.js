import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  Linking,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import {
  searchUserForInvite,
  sendInAppInvitation,
  sendEmailInvitation,
} from '../../services/trustedCircleGroupService';

export default function CircleInviteModal({ visible, circle, currentUser, onClose, onInviteSuccess }) {
  const { colors } = useTheme();
  const [tab, setTab] = useState('in_app'); // 'in_app' | 'email'
  const [searchText, setSearchText] = useState('');
  const [emailText, setEmailText] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [sending, setSending] = useState(false);
  const [statusMsg, setStatusMsg] = useState(null);

  const handleSearch = async (text) => {
    setSearchText(text);
    setStatusMsg(null);
    if (!text.trim() || text.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const results = await searchUserForInvite(text);
      // Filter out current user and existing circle members
      const filtered = results.filter(
        (u) => u.uid !== currentUser?.uid && !(circle?.memberUids || []).includes(u.uid)
      );
      setSearchResults(filtered);
    } catch (e) {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleSendInApp = async (targetUser) => {
    setSending(true);
    setStatusMsg(null);
    try {
      await sendInAppInvitation(circle, currentUser, targetUser);
      setStatusMsg({ type: 'success', text: `Invitation sent to ${targetUser.displayName}!` });
      setSearchResults((prev) => prev.filter((u) => u.uid !== targetUser.uid));
      onInviteSuccess?.();
    } catch (e) {
      setStatusMsg({ type: 'error', text: e.message || 'Failed to send invitation.' });
    } finally {
      setSending(false);
    }
  };

  const handleSendEmail = async () => {
    if (!emailText.trim() || !emailText.includes('@')) {
      setStatusMsg({ type: 'error', text: 'Please enter a valid email address.' });
      return;
    }
    setSending(true);
    setStatusMsg(null);
    try {
      const invite = await sendEmailInvitation(circle, currentUser, emailText.trim());

      // Open email client with pre-formatted invite link
      const subject = encodeURIComponent(`Invitation to join ${circle.name} on GuardianCircle`);
      const body = encodeURIComponent(
        `Hi,\n\n${currentUser.displayName || 'A user'} has invited you to join their private Trusted Circle "${circle.name}" on GuardianCircle.\n\nOpen GuardianCircle or download the app to accept: guardiancircle://invite?circleId=${circle.id}&inviteId=${invite.inviteId}\n\nStay safe!`
      );
      const mailtoUrl = `mailto:${encodeURIComponent(emailText.trim())}?subject=${subject}&body=${body}`;

      if (Platform.OS === 'web') {
        window.open(mailtoUrl, '_blank');
      } else {
        const canOpen = await Linking.canOpenURL(mailtoUrl);
        if (canOpen) Linking.openURL(mailtoUrl);
      }

      setStatusMsg({ type: 'success', text: `Invitation ready for ${emailText.trim()}!` });
      setEmailText('');
      onInviteSuccess?.();
    } catch (e) {
      setStatusMsg({ type: 'error', text: e.message || 'Failed to send email invite.' });
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.modalCard, { backgroundColor: colors.surfaceCard || '#FFFFFF' }]}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={[styles.title, { color: colors.textPrimary }]}>Invite to Circle</Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                Adding to: <Text style={{ fontWeight: 'bold' }}>{circle?.name}</Text>
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Option Tabs */}
          <View style={styles.tabRow}>
            <TouchableOpacity
              style={[styles.tabBtn, tab === 'in_app' && styles.activeTabBtn]}
              onPress={() => {
                setTab('in_app');
                setStatusMsg(null);
              }}
            >
              <Ionicons
                name="person-add"
                size={16}
                color={tab === 'in_app' ? '#00897B' : colors.textSecondary}
              />
              <Text
                style={[
                  styles.tabBtnText,
                  tab === 'in_app' ? styles.activeTabText : { color: colors.textSecondary },
                ]}
              >
                In-App Search
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabBtn, tab === 'email' && styles.activeTabBtn]}
              onPress={() => {
                setTab('email');
                setStatusMsg(null);
              }}
            >
              <Ionicons
                name="mail"
                size={16}
                color={tab === 'email' ? '#00897B' : colors.textSecondary}
              />
              <Text
                style={[
                  styles.tabBtnText,
                  tab === 'email' ? styles.activeTabText : { color: colors.textSecondary },
                ]}
              >
                Email Invite
              </Text>
            </TouchableOpacity>
          </View>

          {/* Feedback Message */}
          {statusMsg && (
            <View
              style={[
                styles.feedbackBox,
                { backgroundColor: statusMsg.type === 'success' ? '#E8F5E9' : '#FFEBEE' },
              ]}
            >
              <Ionicons
                name={statusMsg.type === 'success' ? 'checkmark-circle' : 'alert-circle'}
                size={18}
                color={statusMsg.type === 'success' ? '#2E7D32' : '#D32F2F'}
              />
              <Text
                style={[
                  styles.feedbackText,
                  { color: statusMsg.type === 'success' ? '#2E7D32' : '#D32F2F' },
                ]}
              >
                {statusMsg.text}
              </Text>
            </View>
          )}

          {/* Tab 1: In-App Search */}
          {tab === 'in_app' ? (
            <View style={{ flex: 1 }}>
              <View style={[styles.searchInputRow, { borderColor: colors.border || '#DDD' }]}>
                <Ionicons name="search" size={18} color="#888" style={{ marginRight: 8 }} />
                <TextInput
                  style={[styles.input, { color: colors.textPrimary }]}
                  placeholder="Type @username or email address..."
                  placeholderTextColor="#999"
                  value={searchText}
                  onChangeText={handleSearch}
                  autoCapitalize="none"
                />
                {searching && <ActivityIndicator size="small" color="#00897B" />}
              </View>

              <FlatList
                data={searchResults}
                keyExtractor={(item) => item.uid}
                style={{ flex: 1, marginTop: 10 }}
                ListEmptyComponent={
                  searchText.trim().length >= 2 && !searching ? (
                    <Text style={[styles.emptySearch, { color: colors.textSecondary }]}>
                      No users found. Try full email or username.
                    </Text>
                  ) : null
                }
                renderItem={({ item }) => (
                  <View style={[styles.userRow, { borderBottomColor: colors.border || '#EEE' }]}>
                    <View style={styles.avatarMini}>
                      <Text style={styles.avatarMiniText}>
                        {(item.displayName || 'U')[0].toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={[styles.userName, { color: colors.textPrimary }]}>
                        {item.displayName}
                      </Text>
                      <Text style={[styles.userSub, { color: colors.textSecondary }]}>
                        {item.username ? `@${item.username}` : item.email}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.sendInviteBtn}
                      disabled={sending}
                      onPress={() => handleSendInApp(item)}
                    >
                      <Text style={styles.sendInviteText}>Invite</Text>
                    </TouchableOpacity>
                  </View>
                )}
              />
            </View>
          ) : (
            /* Tab 2: Email Invitation */
            <View style={{ paddingVertical: 12 }}>
              <Text style={[styles.emailInstruction, { color: colors.textSecondary }]}>
                Type your trusted contact's email address. An invitation with a deep link will be
                dispatched so they can join upon opening.
              </Text>

              <View style={[styles.searchInputRow, { borderColor: colors.border || '#DDD', marginTop: 14 }]}>
                <Ionicons name="mail" size={18} color="#888" style={{ marginRight: 8 }} />
                <TextInput
                  style={[styles.input, { color: colors.textPrimary }]}
                  placeholder="contact@example.com"
                  placeholderTextColor="#999"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  value={emailText}
                  onChangeText={setEmailText}
                />
              </View>

              <TouchableOpacity
                style={[styles.dispatchEmailBtn, sending && { opacity: 0.6 }]}
                disabled={sending}
                onPress={handleSendEmail}
              >
                {sending ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <>
                    <Ionicons name="send" size={16} color="#FFF" style={{ marginRight: 6 }} />
                    <Text style={styles.dispatchEmailText}>Send Email Invitation</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    minHeight: 440,
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  subtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
  },
  tabRow: {
    flexDirection: 'row',
    backgroundColor: '#F0F2F5',
    borderRadius: 8,
    padding: 3,
    marginBottom: 14,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 6,
  },
  activeTabBtn: {
    backgroundColor: '#FFFFFF',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  tabBtnText: {
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 6,
  },
  activeTabText: {
    color: '#00897B',
    fontWeight: 'bold',
  },
  searchInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 44,
  },
  input: {
    flex: 1,
    fontSize: 14,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  avatarMini: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#00897B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarMiniText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
  userName: {
    fontSize: 14,
    fontWeight: '600',
  },
  userSub: {
    fontSize: 12,
    marginTop: 1,
  },
  sendInviteBtn: {
    backgroundColor: '#00897B',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 6,
  },
  sendInviteText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  emptySearch: {
    textAlign: 'center',
    marginTop: 20,
    fontSize: 13,
  },
  emailInstruction: {
    fontSize: 13,
    lineHeight: 18,
  },
  dispatchEmailBtn: {
    backgroundColor: '#00897B',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 20,
  },
  dispatchEmailText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
  feedbackBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
  },
  feedbackText: {
    fontSize: 13,
    marginLeft: 8,
    fontWeight: '500',
  },
});

