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
import { db } from '../../services/firebase';
import { useAuth } from '../../context/AuthContext';

export default function MatchChatScreen({ route }) {
  // matchId is passed in as a navigation parameter (set up in Step 3)
  const { matchId } = route.params;
  const { user } = useAuth();

  const [messageText, setMessageText] = useState('');
  const [messages, setMessages] = useState([]);

  // Set up a LIVE listener on this match's messages.
  // Runs once when the screen opens, and cleans itself up when the
  // screen closes — this is important so we don't keep reading from
  // Firestore in the background after the user has left the chat
  // (avoids wasting our free-tier read quota).
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

    // Cleanup: stop listening when this screen closes
    return () => unsubscribe();
  }, [matchId]);

  async function handleSend() {
    const trimmedText = messageText.trim();
    if (!trimmedText) return; // don't send empty messages

    // Clear the input immediately so the app feels responsive
    setMessageText('');

    try {
      const messagesRef = collection(db, 'matches', matchId, 'messages');
      await addDoc(messagesRef, {
        text: trimmedText,
        senderId: user.uid,
        createdAt: serverTimestamp(),
      });
      // Note: sending a push notification to the other person about this
      // new message is handled by the team's shared FCM/notifications
      // setup, not by this screen directly.
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
          value={messageText}
          onChangeText={setMessageText}
          multiline
        />
        <TouchableOpacity style={styles.sendButton} onPress={handleSend}>
          <Text style={styles.sendButtonText}>Send</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  messageList: { padding: 16, flexGrow: 1 },
  messageBubble: {
    maxWidth: '75%',
    padding: 12,
    borderRadius: 16,
    marginBottom: 10,
  },
  myMessage: {
    alignSelf: 'flex-end',
    backgroundColor: '#2E7D32',
    borderBottomRightRadius: 4,
  },
  theirMessage: {
    alignSelf: 'flex-start',
    backgroundColor: '#f0f0f0',
    borderBottomLeftRadius: 4,
  },
  myMessageText: { color: '#fff', fontSize: 14 },
  theirMessageText: { color: '#333', fontSize: 14 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 10,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    backgroundColor: '#fff',
  },
  textInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    maxHeight: 100,
    marginRight: 10,
  },
  sendButton: {
    backgroundColor: '#2E7D32',
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  sendButtonText: { color: '#fff', fontWeight: 'bold' },
});