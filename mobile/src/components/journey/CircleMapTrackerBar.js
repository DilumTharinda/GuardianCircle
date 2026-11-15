import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';

export default function CircleMapTrackerBar({
  circleName,
  memberCount,
  onClose,
  onChangeCircle,
}) {
  return (
    <View style={styles.container}>
      <View style={styles.left}>
        <View style={styles.iconCircle}>
          <MaterialIcons name="groups" size={20} color="#00897B" />
        </View>
        <View style={{ marginLeft: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={styles.title} numberOfLines={1}>
              {circleName || 'Trusted Circle'}
            </Text>
            <View style={styles.liveBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>LIVE</Text>
            </View>
          </View>
          <Text style={styles.subText}>
            {memberCount} member{memberCount !== 1 ? 's' : ''} on map
          </Text>
        </View>
      </View>

      <View style={styles.right}>
        {onChangeCircle && (
          <TouchableOpacity
            style={styles.switchBtn}
            onPress={onChangeCircle}
            activeOpacity={0.8}
          >
            <Ionicons name="swap-horizontal" size={16} color="#00897B" />
            <Text style={styles.switchText}>Switch</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={styles.closeBtn}
          onPress={onClose}
          activeOpacity={0.8}
        >
          <Ionicons name="close" size={18} color="#555" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 70,
    left: 16,
    right: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    zIndex: 100,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E0F2F1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#212121',
    maxWidth: 150,
  },
  subText: {
    fontSize: 12,
    color: '#666',
    marginTop: 1,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginLeft: 6,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#43A047',
    marginRight: 4,
  },
  liveText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#2E7D32',
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  switchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E0F2F1',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginRight: 8,
  },
  switchText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#00897B',
    marginLeft: 4,
  },
  closeBtn: {
    padding: 6,
    backgroundColor: '#F5F5F5',
    borderRadius: 16,
  },
});

