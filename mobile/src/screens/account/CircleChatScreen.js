import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Image,
  ActivityIndicator,
} from 'react-native';
import { useHeaderHeight } from '@react-navigation/elements';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import {
  subscribeCircleMessages,
  sendCircleMessage,
  getCircleById,
} from '../../services/trustedCircleGroupService';

export default function CircleChatScreen({ route, navigation }) {
  const insets = useSafeAreaInsets();
  const { circleId, circleName: initialCircleName, circlePhotoURL: initialPhotoURL, members: initialMembers } = route.params || {};
  const { user, userProfile } = useAuth();
  const { colors, isDark } = useTheme();
  const headerHeight = useHeaderHeight();

  const [circleData, setCircleData] = useState({
    name: initialCircleName,
    photoURL: initialPhotoURL,
    members: Array.isArray(initialMembers) ? initialMembers : [],
  });

  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const flatListRef = useRef(null);

  // Fetch full circle data if members weren't passed or to keep it updated
  useEffect(() => {
    if (!circleId) return;
    getCircleById(circleId).then((data) => {
      if (data) {
        setCircleData({
          name: data.name || initialCircleName,
          photoURL: data.photoURL || initialPhotoURL,
          members: Array.isArray(data.members) ? data.members : [],
        });
      }
    }).catch(() => {});
  }, [circleId]);

  // Compute WhatsApp style subtitle (comma-separated member names like "You, John, Sarah")
  const membersSubtitle = React.useMemo(() => {
    const list = circleData.members || [];
    if (list.length === 0) return 'Tap here for circle info';

    const names = list.map((m) =>
      m.uid === user?.uid ? 'You' : m.displayName || m.username || 'Member'
    );
    // Put "You" first if in list
    if (names.includes('You')) {
      names.splice(names.indexOf('You'), 1);
      names.unshift('You');
    }
    return names.join(', ');
  }, [circleData.members, user?.uid]);

  // Set WhatsApp style header
  useEffect(() => {
    navigation.setOptions({
      headerTitleAlign: 'left',
      headerTitle: () => (
        <View style={styles.headerTitleWrap}>
          {circleData.photoURL ? (
            <Image source={{ uri: circleData.photoURL }} style={styles.headerAvatarImg} />
          ) : (
            <View style={styles.headerAvatarDefault}>
              <MaterialIcons name="groups" size={22} color="#00897B" />
            </View>
          )}
          <View style={styles.headerTextCol}>
            <Text style={styles.headerTitleText} numberOfLines={1}>
              {circleData.name || 'Trusted Circle'}
            </Text>
            <Text style={styles.headerSubText} numberOfLines={1}>
              {membersSubtitle}
            </Text>
          </View>
        </View>
      ),
    });
  }, [navigation, circleData.name, circleData.photoURL, membersSubtitle]);

  // Subscribe to real-time circle messages
  useEffect(() => {
    if (!circleId) return;
    const unsub = subscribeCircleMessages(circleId, (loaded) => {
      setMessages(loaded);
    });
    return () => unsub?.();
  }, [circleId]);

  const handleSend = async () => {
    const textToSend = inputText.trim();
    if (!textToSend || sending || !user) return;

    setInputText('');
    setSending(true);
    try {
      await sendCircleMessage(
        circleId,
        {
          uid: user.uid,
          displayName: userProfile?.displayName || user.displayName || 'Member',
          photoURL: userProfile?.photoURL || user.photoURL || null,
        },
        textToSend
      );
    } catch (err) {
      console.warn('Failed to send circle message:', err);
    } finally {
      setSending(false);
    }
  };

  const renderMessageItem = ({ item }) => {
    const isMine = item.senderId === user?.uid;
    const senderInitial = (item.senderName || 'U')[0].toUpperCase();

    // Format timestamp
    let timeStr = '';
    if (item.createdAt?.toDate) {
      const d = item.createdAt.toDate();
      timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (item.createdAt) {
      const d = new Date(item.createdAt);
      if (!isNaN(d.getTime())) {
        timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
    }

    return (
      <View style={[styles.msgRow, isMine ? styles.msgRowMine : styles.msgRowOther]}>
        {!isMine && (
          item.senderPhotoURL ? (
            <Image source={{ uri: item.senderPhotoURL }} style={styles.msgAvatar} />
          ) : (
            <View style={[styles.msgAvatarPlaceholder, { backgroundColor: colors.darkGreenMid || '#06756A' }]}>
              <Text style={styles.msgAvatarText}>{senderInitial}</Text>
            </View>
          )
        )}

        <View
          style={[
            styles.bubble,
            isMine
              ? [
                  styles.bubbleMine,
                  {
                    backgroundColor: isDark ? '#005C4B' : '#00897B',
                  },
                ]
              : [
                  styles.bubbleOther,
                  {
                    backgroundColor: isDark ? colors.surface || '#1A2420' : colors.surface || '#FFFFFF',
                    borderWidth: isDark ? 1 : 0,
                    borderColor: colors.border || '#2A3D2A',
                  },
                ],
          ]}
        >
          {!isMine && (
            <Text style={[styles.senderNameLabel, { color: isDark ? colors.accentGreen || '#00E676' : colors.darkGreenMid || '#00897B' }]}>
              {item.senderName || 'Member'}
            </Text>
          )}

          <Text
            style={[
              styles.bubbleText,
              { color: isMine ? '#FFFFFF' : colors.textPrimary || '#1C1C1E' },
            ]}
          >
            {item.text}
          </Text>

          {timeStr ? (
            <Text
              style={[
                styles.bubbleTime,
                { color: isMine ? 'rgba(255,255,255,0.75)' : colors.textSecondary || '#8E8E93' },
              ]}
            >
              {timeStr}
            </Text>
          ) : null}
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: isDark ? colors.background || '#0D1512' : '#EFEAE2' }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={headerHeight || (Platform.OS === 'ios' ? 88 : 80)}
    >
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item, index) => item.id || `msg-${index}`}
        renderItem={renderMessageItem}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        onLayout={() => flatListRef.current?.scrollToEnd({ animated: false })}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <View
              style={[
                styles.emptyIconCircle,
                { backgroundColor: isDark ? colors.darkGreenSurface || '#032B27' : '#E0F2F1' },
              ]}
            >
              <Ionicons
                name="chatbubbles"
                size={36}
                color={isDark ? colors.darkGreenLight || '#0A9B8D' : colors.darkGreenMid || '#00897B'}
              />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
              Welcome to {circleData.name || 'the Circle Chat'}!
            </Text>
            <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
              Send a quick update, check in with members, or share travel safety messages.
            </Text>
          </View>
        }
      />

      {/* WhatsApp Style Chat Bar */}
      <View
        style={[
          styles.inputBar,
          {
            backgroundColor: isDark ? colors.surface || '#1A2420' : colors.surface || '#FFFFFF',
            borderTopColor: colors.border || 'rgba(0,0,0,0.06)',
            paddingBottom: insets.bottom > 0 ? insets.bottom : (Platform.OS === 'android' ? 12 : 8),
          },
        ]}
      >
        <TextInput
          style={[
            styles.textInput,
            {
              backgroundColor: isDark ? colors.background || '#0D1512' : '#F0F2F5',
              color: colors.textPrimary || '#111B21',
              borderColor: isDark ? colors.border || '#2A3D2A' : 'transparent',
              borderWidth: isDark ? 1 : 0,
            },
          ]}
          placeholder="Message circle..."
          placeholderTextColor={colors.textMuted || '#8696A0'}
          value={inputText}
          onChangeText={setInputText}
          multiline
          maxLength={1000}
        />
        <TouchableOpacity
          style={[
            styles.sendBtn,
            { backgroundColor: isDark ? '#00A884' : colors.darkGreenMid || '#00897B' },
            !inputText.trim() && styles.sendBtnDisabled,
          ]}
          onPress={handleSend}
          disabled={!inputText.trim() || sending}
          activeOpacity={0.8}
        >
          {sending ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <Ionicons name="send" size={18} color="#FFF" />
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: 220,
  },
  headerTextCol: {
    marginLeft: 10,
    flexShrink: 1,
    justifyContent: 'center',
  },
  headerAvatarImg: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#E0E0E0',
  },
  headerAvatarDefault: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  headerSubText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 11.5,
    marginTop: 1,
  },
  listContent: {
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  msgRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 8,
  },
  msgRowMine: {
    justifyContent: 'flex-end',
  },
  msgRowOther: {
    justifyContent: 'flex-start',
  },
  msgAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginRight: 6,
    backgroundColor: '#E0E0E0',
  },
  msgAvatarPlaceholder: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#00897B',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  msgAvatarText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: 'bold',
  },
  bubble: {
    maxWidth: '78%',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
  },
  bubbleMine: {
    borderBottomRightRadius: 2,
  },
  bubbleOther: {
    borderBottomLeftRadius: 2,
  },
  senderNameLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#00897B',
    marginBottom: 3,
  },
  bubbleText: {
    fontSize: 14,
    lineHeight: 19,
  },
  bubbleTime: {
    fontSize: 10,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.06)',
  },
  textInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontSize: 14,
    marginRight: 8,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#00897B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    opacity: 0.5,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    paddingHorizontal: 30,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#E0F2F1',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 6,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
});

