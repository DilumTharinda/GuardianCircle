import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Image,
} from 'react-native';

export default function ReportFoundScreen({ navigation }) {
  const [description, setDescription] = useState('');
  const [photoUri, setPhotoUri] = useState(null);
  const [isLinkedToLost, setIsLinkedToLost] = useState(false);
  const [selectedLostReport, setSelectedLostReport] = useState(null);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Report a Found Item</Text>

      <Text style={styles.label}>Description / Notes</Text>
      <TextInput
        style={styles.textArea}
        placeholder="Describe what you found, where, and when..."
        value={description}
        onChangeText={setDescription}
        multiline
        numberOfLines={4}
      />

      <Text style={styles.label}>Photo (optional)</Text>
      <TouchableOpacity style={styles.photoBox}>
        {photoUri ? (
          <Image source={{ uri: photoUri }} style={styles.photoPreview} />
        ) : (
          <Text style={styles.photoBoxText}>+ Add Photo</Text>
        )}
      </TouchableOpacity>

      <Text style={styles.label}>Location</Text>
      <TouchableOpacity style={styles.locationBox}>
        <Text style={styles.locationBoxText}>📍 Tap to set location</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.linkToggle}
        onPress={() => setIsLinkedToLost(!isLinkedToLost)}
      >
        <View style={[styles.checkbox, isLinkedToLost && styles.checkboxChecked]}>
          {isLinkedToLost && <Text style={styles.checkmark}>✓</Text>}
        </View>
        <Text style={styles.linkToggleText}>
          This matches an existing lost item report
        </Text>
      </TouchableOpacity>

      {isLinkedToLost && (
        <TouchableOpacity style={styles.selectReportBox}>
          <Text style={styles.selectReportText}>
            {selectedLostReport
              ? `Selected: ${selectedLostReport.description}`
              : 'Tap to select a lost report'}
          </Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity style={styles.submitButton}>
        <Text style={styles.submitButtonText}>Submit Found Report</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: 'bold', marginBottom: 20, color: '#2E7D32' },
  label: { fontSize: 14, fontWeight: '600', color: '#333', marginTop: 16, marginBottom: 8 },
  textArea: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    textAlignVertical: 'top',
    minHeight: 100,
  },
  photoBox: {
    height: 150,
    borderWidth: 2,
    borderColor: '#ddd',
    borderStyle: 'dashed',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f9f9f9',
    overflow: 'hidden',
  },
  photoBoxText: { color: '#999', fontSize: 15 },
  photoPreview: { width: '100%', height: '100%', borderRadius: 12 },
  locationBox: {
    padding: 14,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    backgroundColor: '#f9f9f9',
  },
  locationBoxText: { color: '#666', fontSize: 14 },
  linkToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderWidth: 2,
    borderColor: '#2E7D32',
    borderRadius: 5,
    marginRight: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: { backgroundColor: '#2E7D32' },
  checkmark: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  linkToggleText: { fontSize: 14, color: '#333', flex: 1 },
  selectReportBox: {
    padding: 14,
    borderWidth: 1,
    borderColor: '#2E7D32',
    borderRadius: 10,
    backgroundColor: '#E8F5E9',
    marginTop: 10,
  },
  selectReportText: { color: '#2E7D32', fontSize: 14 },
  submitButton: {
    backgroundColor: '#2E7D32',
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 30,
  },
  submitButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});