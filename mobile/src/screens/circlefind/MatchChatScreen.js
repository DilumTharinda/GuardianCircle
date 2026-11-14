import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { Ionicons } from '@expo/vector-icons';
import { db } from '../../services/firebase';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { RADIUS, SHADOWS } from '../../constants/theme';

export default function MatchChatScreen({ route }) {
  const { matchId } = route.params;
  const { user } = useAuth();
  const { colors, isDark } = useTheme();

  const [messageText, setMessageText] = useState('');
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    const messagesRef = collection(db, 'matches', matchId, 'messages');
    const q = query(messagesRef, orderBy('createdAt', 'asc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const loadedMessages = snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          text: data.text,
          senderId: data.senderId,
          isMine: data.senderId === user.uid,
        };
      });
      setMessages(loadedMessages);
    });

    return () => unsubscribe();
  }, [matchId]);

  async function handleSend() {
    const trimmedText = messageText.trim();
    if (!trimmedText) return;

    setMessageText('');

    try {
      const messagesRef = collection(db, 'matches', matchId, 'messages');
      await addDoc(messagesRef, {
        text: trimmedText,
        senderId: user.uid,
        createdAt: serverTimestamp(),
      });
    } catch (error) {
      console.log('Error sending message:', error.message);
    }
  }

  function renderMessage({ item }) {
    return (
      <View
        style={[
          styles.messageBubble,
          item.isMine ? styles.myMessage : styles.theirMessage,
        ]}
      >
        <Text style={item.isMine ? styles.myMessageText : styles.theirMessageText}>
          {item.text}
        </Text>
      </View>
    );
  }

  const styles = getStyles(colors, isDark);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderMessage}
        contentContainerStyle={styles.messageList}
      />

      <View style={styles.inputRow}>
        <TextInput
          style={styles.textInput}
          placeholder="Type a message..."
          placeholderTextColor={colors.textMuted}
          value={messageText}
          onChangeText={setMessageText}
          multiline
        />
        <TouchableOpacity style={styles.sendButton} onPress={handleSend} activeOpacity={0.8}>
          <Ionicons name="send" size={16} color="#FFF" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const getStyles = (colors, isDark) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    messageList: { padding: 16, flexGrow: 1 },
    messageBubble: {
      maxWidth: '78%',
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: RADIUS.lg,
      marginBottom: 10,
      ...SHADOWS.small,
    },
    myMessage: {
      alignSelf: 'flex-end',
      backgroundColor: colors.darkGreenMid,
      borderBottomRightRadius: 2,
    },
    theirMessage: {
      alignSelf: 'flex-start',
      backgroundColor: colors.surface,
      borderBottomLeftRadius: 2,
      borderWidth: 1,
      borderColor: colors.border,
    },
    myMessageText: { color: '#FFF', fontSize: 14, lineHeight: 19 },
    theirMessageText: { color: colors.textPrimary, fontSize: 14, lineHeight: 19 },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.surface,
      gap: 10,
    },
    textInput: {
      flex: 1,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.xl,
      paddingHorizontal: 16,
      paddingVertical: 9,
      fontSize: 14,
      color: colors.textPrimary,
      backgroundColor: colors.background,
      maxHeight: 100,
    },
    sendButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.darkGreenMid,
      alignItems: 'center',
      justifyContent: 'center',
      ...SHADOWS.small,
    },
  });
