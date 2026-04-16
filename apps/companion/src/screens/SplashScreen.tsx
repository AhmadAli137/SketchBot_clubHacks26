import { ActivityIndicator, Animated, StyleSheet, Text, View } from 'react-native';

import { colors, radius, space } from '../theme';

export function SplashScreen({
  splashFloatAnim,
  splashPulseAnim,
}: {
  splashFloatAnim: Animated.Value;
  splashPulseAnim: Animated.Value;
}) {
  return (
    <View style={styles.splashScreen}>
      <Animated.View
        style={[
          styles.splashOrbA,
          {
            transform: [
              {
                translateY: splashFloatAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, -18],
                }),
              },
            ],
            opacity: splashPulseAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [0.24, 0.42],
            }),
          },
        ]}
      />
      <Animated.View
        style={[
          styles.splashOrbB,
          {
            transform: [
              {
                translateY: splashFloatAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 12],
                }),
              },
            ],
            opacity: splashPulseAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [0.28, 0.5],
            }),
          },
        ]}
      />

      <View style={styles.splashTopRow}>
        <View style={styles.splashBadge}>
          <Text style={styles.splashBadgeText}>SketchBot</Text>
        </View>
        <View style={styles.splashMiniPill}>
          <Text style={styles.splashMiniPillText}>Companion</Text>
        </View>
      </View>

      <Text style={styles.splashTitle}>Camera Buddy</Text>
      <Text style={styles.splashCopy}>
        Jump into the classroom, scan the code, and bring SketchBot to life with a bigger, brighter live camera view.
      </Text>

      <View style={styles.splashLoadingRow}>
        <ActivityIndicator color={colors.cyan} />
        <Text style={styles.splashLoadingText}>Setting up the companion experience...</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  splashScreen: {
    minHeight: 620,
    borderRadius: radius['2xl'],
    overflow: 'hidden',
    padding: space[7],
    alignItems: 'flex-start',
    justifyContent: 'flex-end',
    backgroundColor: '#121934',
    shadowColor: '#1f3760',
    shadowOpacity: 0.26,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 16 },
    elevation: 6,
  },
  splashTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 18,
  },
  splashOrbA: {
    position: 'absolute',
    width: 240,
    height: 240,
    borderRadius: 999,
    top: -30,
    right: -40,
    backgroundColor: '#79d5ff',
    opacity: 0.34,
  },
  splashOrbB: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 999,
    bottom: -90,
    left: -40,
    backgroundColor: '#ffb6df',
    opacity: 0.42,
  },
  splashBadge: {
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  splashBadgeText: {
    color: '#f3f8ff',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  splashMiniPill: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: 'rgba(123, 224, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(123, 224, 255, 0.18)',
  },
  splashMiniPillText: {
    color: '#cdefff',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  splashTitle: {
    fontSize: 40,
    lineHeight: 44,
    fontWeight: '900',
    color: '#ffffff',
    marginBottom: 12,
  },
  splashCopy: {
    fontSize: 17,
    lineHeight: 25,
    color: '#d6e8ff',
    maxWidth: '90%',
  },
  splashLoadingRow: {
    marginTop: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  splashLoadingText: {
    color: '#dcecff',
    fontSize: 14,
    fontWeight: '700',
  },
});

