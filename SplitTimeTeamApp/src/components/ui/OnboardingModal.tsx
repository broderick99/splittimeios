import React, { useMemo, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type ImageSourcePropType,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '@/constants/colors';
import { Layout } from '@/constants/layout';

interface OnboardingModalProps {
  visible: boolean;
  onFinish: () => void;
}

type Slide = {
  key: string;
  title: string;
  body: string;
  image: ImageSourcePropType;
};

const rosterShot = require('../../../assets/onboarding/roster.png');
const workoutShot = require('../../../assets/onboarding/workout.png');
const timerShot = require('../../../assets/onboarding/timer.png');
const historyShot = require('../../../assets/onboarding/history.png');
const exportShot = require('../../../assets/onboarding/export.png');
const trackBackground = require('../../../assets/onboarding/track-background.png');

const SLIDES: Slide[] = [
  {
    key: 'roster',
    title: 'Build Your Roster',
    body: 'Add athletes and organize them into groups before the workout starts.',
    image: rosterShot,
  },
  {
    key: 'workouts',
    title: 'Create Workouts',
    body: 'Build custom workouts once, then save them as templates for later.',
    image: workoutShot,
  },
  {
    key: 'timer',
    title: 'Time Athletes Live',
    body: 'Start, split, and stop athletes individually or time whole groups together.',
    image: timerShot,
  },
  {
    key: 'history',
    title: 'Save Every Session',
    body: 'Keep workout history, review past results, and rerun saved workouts anytime.',
    image: historyShot,
  },
  {
    key: 'export',
    title: 'Export Results',
    body: 'Share workout history and splits when you need to send results out.',
    image: exportShot,
  },
];

export default function OnboardingModal({ visible, onFinish }: OnboardingModalProps) {
  const { width, height } = useWindowDimensions();
  const listRef = useRef<FlatList<Slide>>(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const [index, setIndex] = useState(0);

  const isLast = useMemo(() => index === SLIDES.length - 1, [index]);

  const goToIndex = (nextIndex: number) => {
    const clamped = Math.max(0, Math.min(nextIndex, SLIDES.length - 1));
    listRef.current?.scrollToIndex({ index: clamped, animated: true });
    setIndex(clamped);
  };

  const handleNext = () => {
    if (isLast) {
      onFinish();
      return;
    }
    goToIndex(index + 1);
  };

  const handleBack = () => {
    goToIndex(index - 1);
  };

  const handleMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const nextIndex = Math.round(e.nativeEvent.contentOffset.x / width);
    setIndex(Math.max(0, Math.min(nextIndex, SLIDES.length - 1)));
  };

  const screenshotHeight = Math.min(height * 0.61, 635);
  const screenshotWidth = Math.min(screenshotHeight * 0.462, width - 80);
  const backgroundWidth = Math.max(width * 1.75, height * 1.25);
  const maxBackgroundShift = Math.max(backgroundWidth - width, 0);
  const backgroundTranslateX = scrollX.interpolate({
    inputRange: [0, width * (SLIDES.length - 1)],
    outputRange: [0, -maxBackgroundShift],
    extrapolate: 'clamp',
  });

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen">
      <SafeAreaView style={styles.container}>
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <Animated.Image
            source={trackBackground}
            style={[
              styles.backgroundImage,
              {
                width: backgroundWidth,
                height,
                transform: [{ translateX: backgroundTranslateX }],
              },
            ]}
            resizeMode="cover"
          />
          <View style={styles.backgroundOverlay} />
        </View>

        <Animated.FlatList
          ref={listRef}
          data={SLIDES}
          horizontal
          pagingEnabled
          bounces={false}
          keyExtractor={(item) => item.key}
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={handleMomentumEnd}
          scrollEventThrottle={16}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { x: scrollX } } }],
            { useNativeDriver: true }
          )}
          renderItem={({ item, index: itemIndex }) => {
            const inputRange = [
              (itemIndex - 1) * width,
              itemIndex * width,
              (itemIndex + 1) * width,
            ];

            const opacity = scrollX.interpolate({
              inputRange,
              outputRange: [0.55, 1, 0.55],
              extrapolate: 'clamp',
            });

            const translateY = scrollX.interpolate({
              inputRange,
              outputRange: [22, 0, 22],
              extrapolate: 'clamp',
            });

            const scale = scrollX.interpolate({
              inputRange,
              outputRange: [0.97, 1, 0.97],
              extrapolate: 'clamp',
            });

            return (
              <View style={[styles.page, { width }]}>
                <Animated.View
                  style={[
                    styles.pageContent,
                    {
                      opacity,
                      transform: [{ translateY }, { scale }],
                    },
                  ]}
                >
                  <View style={styles.screenshotWrap}>
                    <View
                      style={[
                        styles.screenshotCard,
                        {
                          width: screenshotWidth,
                          height: screenshotHeight,
                        },
                      ]}
                    >
                      <Image source={item.image} style={styles.screenshot} resizeMode="contain" />
                    </View>
                  </View>

                  <View style={styles.copyWrap}>
                    <Text style={styles.title}>{item.title}</Text>
                    <Text
                      style={styles.body}
                      numberOfLines={2}
                      adjustsFontSizeToFit
                      minimumFontScale={0.88}
                    >
                      {item.body}
                    </Text>
                  </View>
                </Animated.View>
              </View>
            );
          }}
        />

        <View style={styles.footer}>
          <View style={styles.dotsRow}>
            {SLIDES.map((_, i) => (
              <Pressable
                key={i}
                onPress={() => goToIndex(i)}
                hitSlop={8}
                style={[styles.dot, i === index && styles.dotActive]}
              />
            ))}
          </View>

          <View style={styles.actionsRow}>
            <Pressable
              onPress={handleBack}
              disabled={index === 0}
              style={[styles.backButton, index === 0 && styles.backButtonDisabled]}
            >
              <Text style={[styles.backButtonText, index === 0 && styles.backButtonTextDisabled]}>
                Back
              </Text>
            </Pressable>

            <Pressable onPress={handleNext} style={styles.nextButton}>
              <Text style={styles.nextButtonText}>{isLast ? 'Get Started' : 'Next'}</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  backgroundImage: {
    position: 'absolute',
    left: 0,
    top: 0,
    opacity: 1,
  },
  backgroundOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(248,250,252,0.22)',
  },
  page: {
    flex: 1,
  },
  pageContent: {
    flex: 1,
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 244,
    justifyContent: 'flex-start',
  },
  screenshotWrap: {
    width: '100%',
    alignItems: 'center',
    paddingTop: 4,
  },
  screenshotCard: {
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.1,
    shadowRadius: 18,
    elevation: 5,
  },
  screenshot: {
    width: '100%',
    height: '100%',
  },
  copyWrap: {
    paddingHorizontal: 28,
    marginTop: 12,
    marginBottom: 12,
    marginHorizontal: 12,
    paddingVertical: 16,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.76)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.7)',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  title: {
    fontSize: 30,
    lineHeight: 34,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'center',
    marginBottom: 10,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    color: '#475569',
    textAlign: 'center',
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: Layout.paddingLarge,
    paddingBottom: 12,
    paddingTop: 0,
    backgroundColor: 'transparent',
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 14,
    alignSelf: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.52)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.65)',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#CBD5E1',
  },
  dotActive: {
    width: 24,
    backgroundColor: Colors.primary,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 14,
  },
  backButton: {
    flex: 1,
    minHeight: 56,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.78)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.78)',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 3,
  },
  backButtonDisabled: {
    opacity: 0.45,
  },
  backButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
  },
  backButtonTextDisabled: {
    color: Colors.textTertiary,
  },
  nextButton: {
    flex: 1,
    minHeight: 56,
    borderRadius: 18,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 6,
  },
  nextButtonText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
