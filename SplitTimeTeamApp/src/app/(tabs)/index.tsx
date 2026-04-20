import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import {
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  Text,
  Pressable,
  Dimensions,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Modal,
} from 'react-native';
import { useNavigation, useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useDatabase } from '@/context/DatabaseContext';
import { useRoster } from '@/context/RosterContext';
import { useWorkout } from '@/context/WorkoutContext';
import { useTemplates } from '@/context/TemplateContext';
import { expandTemplate } from '@/utils/template-expander';
import GroupTimerSection from '@/components/timer/GroupTimerSection';
import BigButton from '@/components/ui/BigButton';
import EmptyState from '@/components/ui/EmptyState';
import { Colors } from '@/constants/colors';
import { Layout } from '@/constants/layout';
import type { TemplateSummary } from '@/types';
import {
  TIMER_SETTINGS_DEFAULTS,
  TIMER_SETTINGS_KEYS,
  getBooleanTimerSetting,
} from '@/utils/timer-settings';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function TimerScreen() {
  const db = useDatabase();
  const { athletes, groups } = useRoster();
  const {
    isActive,
    timerStates,
    displayTick,
    structuredSteps,
    athleteProgress,
    startWorkout,
    startStructuredWorkout,
    startGroup,
    stopGroup,
    lapGroup,
    startAthlete,
    stopAthlete,
    recordSplit,
    undoLastSplit,
    advanceStep,
    advanceGroup,
    templateName,
    resetWorkout,
    saveWorkout,
    discardWorkout,
    getGroupedTimers,
  } = useWorkout();
  const { templates, refreshTemplates, getTemplateStepsAndGroups } = useTemplates();

  const navigation = useNavigation();
  const router = useRouter();
  const [showSave, setShowSave] = useState(false);
  const [workoutName, setWorkoutName] = useState('');
  const [activeTabIndex, setActiveTabIndex] = useState(0);
  const [isStartModalOpen, setIsStartModalOpen] = useState(false);
  const [selectedAthleteIds, setSelectedAthleteIds] = useState<Set<string>>(new Set());
  const [pendingTemplate, setPendingTemplate] = useState<TemplateSummary | null>(null);
  const [autoReorderAthletes, setAutoReorderAthletes] = useState<boolean>(
    TIMER_SETTINGS_DEFAULTS.autoReorder
  );
  const [showTapHints, setShowTapHints] = useState<boolean>(TIMER_SETTINGS_DEFAULTS.showTapHints);
  const [showWorkoutStatusStrip, setShowWorkoutStatusStrip] = useState<boolean>(
    TIMER_SETTINGS_DEFAULTS.showStatusStrip
  );
  const scrollViewRef = useRef<ScrollView>(null);

  const loadTimerSettings = useCallback(async () => {
    const [autoReorder, tapHints, workoutStatusStrip] = await Promise.all([
      getBooleanTimerSetting(
        db,
        TIMER_SETTINGS_KEYS.autoReorder,
        TIMER_SETTINGS_DEFAULTS.autoReorder
      ),
      getBooleanTimerSetting(
        db,
        TIMER_SETTINGS_KEYS.showTapHints,
        TIMER_SETTINGS_DEFAULTS.showTapHints
      ),
      getBooleanTimerSetting(
        db,
        TIMER_SETTINGS_KEYS.showStatusStrip,
        TIMER_SETTINGS_DEFAULTS.showStatusStrip
      ),
    ]);

    setAutoReorderAthletes(autoReorder);
    setShowTapHints(tapHints);
    setShowWorkoutStatusStrip(workoutStatusStrip);
  }, [db]);

  // Refresh templates when timer tab is focused
  useFocusEffect(
    useCallback(() => {
      refreshTemplates();
      void loadTimerSettings();
    }, [loadTimerSettings, refreshTemplates])
  );

  const groupedTimers = useMemo(() => {
    if (!isActive) return [];
    return getGroupedTimers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, timerStates, getGroupedTimers]);

  // Compute elapsed time for each group (used by GroupTimerSection)
  const groupElapsedMap = useMemo(() => {
    // displayTick is intentionally used to force this memo to refresh while running.
    void displayTick;
    const map = new Map<string, number>();
    for (const block of groupedTimers) {
      const key = block.groupId ?? '__unassigned';
      const { groupStartedAt, groupStoppedAt } = block;
      if (groupStartedAt === null) {
        map.set(key, 0);
      } else if (groupStoppedAt !== null) {
        map.set(key, groupStoppedAt - groupStartedAt);
      } else {
        map.set(key, Date.now() - groupStartedAt);
      }
    }
    return map;
  }, [groupedTimers, displayTick]);

  const workoutState = useMemo(() => {
    const allAthletes = groupedTimers.flatMap((g) => g.athletes);
    const runningCount = allAthletes.filter((a) => a.status === 'running').length;
    const stoppedCount = allAthletes.filter((a) => a.status === 'stopped').length;
    const idleCount = allAthletes.filter((a) => a.status === 'idle').length;

    const recoveryCount = athleteProgress
      ? allAthletes.filter((a) => {
          const p = athleteProgress.get(a.athleteId);
          return p?.stepStatus === 'recovery_countdown' || p?.stepStatus === 'recovery_waiting';
        }).length
      : 0;

    if (allAthletes.length > 0 && stoppedCount === allAthletes.length) {
      return {
        label: 'All Athletes Stopped',
        detail: 'All timers are frozen',
        color: Colors.stopped,
        background: Colors.surfaceSecondary,
      };
    }

    if (recoveryCount > 0) {
      return {
        label: 'Recovery In Progress',
        detail: `${recoveryCount} athlete${recoveryCount !== 1 ? 's' : ''} recovering`,
        color: Colors.recovery,
        background: Colors.recovery + '14',
      };
    }

    if (runningCount > 0) {
      return {
        label: 'Running',
        detail: `${runningCount} running${idleCount > 0 ? ` • ${idleCount} waiting` : ''}`,
        color: Colors.running,
        background: Colors.running + '14',
      };
    }

    return {
      label: 'Ready',
      detail: 'Waiting to start',
      color: Colors.textSecondary,
      background: Colors.surfaceSecondary,
    };
  }, [groupedTimers, athleteProgress]);

  const beginWorkoutWithAthletes = useCallback(
    async (template?: TemplateSummary | null) => {
      const selectedAthletes = athletes.filter((athlete) => selectedAthleteIds.has(athlete.id));
      if (selectedAthletes.length === 0) {
        return;
      }

      const selectedGroupIds = new Set(selectedAthletes.map((athlete) => athlete.groupId));
      const selectedGroups = groups.filter((group) => selectedGroupIds.has(group.id));

      if (template) {
        const { steps, repeatGroups } = await getTemplateStepsAndGroups(template.id);
        const expanded = expandTemplate(steps, repeatGroups);
        startStructuredWorkout(
          selectedAthletes,
          selectedGroups,
          template.id,
          template.name,
          expanded
        );
      } else {
        startWorkout(selectedAthletes, selectedGroups);
      }

      setIsStartModalOpen(false);
      setPendingTemplate(null);
      setSelectedAthleteIds(new Set());
      setActiveTabIndex(0);
    },
    [
      athletes,
      getTemplateStepsAndGroups,
      groups,
      selectedAthleteIds,
      startStructuredWorkout,
      startWorkout,
    ]
  );

  const openStartModal = useCallback(
    (template?: TemplateSummary | null) => {
      if (athletes.length === 0) return;
      setPendingTemplate(template ?? null);
      setSelectedAthleteIds(new Set(athletes.map((athlete) => athlete.id)));
      setIsStartModalOpen(true);
    },
    [athletes]
  );

  const toggleAthleteSelection = useCallback((athleteId: string) => {
    setSelectedAthleteIds((prev) => {
      const next = new Set(prev);
      if (next.has(athleteId)) {
        next.delete(athleteId);
      } else {
        next.add(athleteId);
      }
      return next;
    });
  }, []);

  const handleStartWorkout = () => {
    if (athletes.length === 0) return;
    openStartModal(null);
  };

  const handleConfirmStart = useCallback(() => {
    void beginWorkoutWithAthletes(pendingTemplate);
  }, [beginWorkoutWithAthletes, pendingTemplate]);

  const handleSelectAllAthletes = useCallback(() => {
    setSelectedAthleteIds(new Set(athletes.map((athlete) => athlete.id)));
  }, [athletes]);

  const handleClearAthletes = useCallback(() => {
    setSelectedAthleteIds(new Set());
  }, []);

  const selectedAthleteCount = selectedAthleteIds.size;
  const allAthletesSelected = athletes.length > 0 && selectedAthleteCount === athletes.length;
  const noAthletesSelected = selectedAthleteCount === 0;
  const startModalTitle = pendingTemplate ? 'Select Athletes for Template' : 'Select Athletes';
  const startModalSubtitle = pendingTemplate
    ? 'Choose which athletes are running this workout template today.'
    : 'Choose which athletes are running this workout today.';

  const closeStartModal = useCallback(() => {
    setIsStartModalOpen(false);
    setPendingTemplate(null);
  }, []);

  const startSelectionModal = (
    <Modal
      visible={isStartModalOpen}
      transparent
      animationType="fade"
      presentationStyle="overFullScreen"
      onRequestClose={closeStartModal}
    >
      <View style={styles.startModalBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={closeStartModal} />
        <View style={styles.startModalCard}>
          <View style={styles.startModalHeader}>
            <View style={styles.startModalHeaderText}>
              <Text style={styles.startModalTitle}>{startModalTitle}</Text>
              <Text style={styles.startModalSubtitle}>{startModalSubtitle}</Text>
            </View>
            <Pressable onPress={closeStartModal} hitSlop={10}>
              <FontAwesome name="times" size={20} color={Colors.textSecondary} />
            </Pressable>
          </View>

          <View style={styles.startModalActions}>
            <Pressable
              onPress={handleSelectAllAthletes}
              disabled={allAthletesSelected}
              style={[
                styles.startModalActionChip,
                allAthletesSelected && styles.startModalActionChipDisabled,
              ]}
            >
              <Text
                style={[
                  styles.startModalActionText,
                  allAthletesSelected && styles.startModalActionTextDisabled,
                ]}
              >
                Select All
              </Text>
            </Pressable>
            <Pressable
              onPress={handleClearAthletes}
              disabled={noAthletesSelected}
              style={[
                styles.startModalActionChip,
                noAthletesSelected && styles.startModalActionChipDisabled,
              ]}
            >
              <Text
                style={[
                  styles.startModalActionText,
                  noAthletesSelected && styles.startModalActionTextDisabled,
                ]}
              >
                Clear
              </Text>
            </Pressable>
            <Text style={styles.startModalCount}>{selectedAthleteCount} selected</Text>
          </View>

          <ScrollView
            style={styles.startModalList}
            contentContainerStyle={styles.startModalListContent}
          >
            {athletes.map((athlete) => {
              const isSelected = selectedAthleteIds.has(athlete.id);
              const group = groups.find((item) => item.id === athlete.groupId);
              return (
                <Pressable
                  key={athlete.id}
                  onPress={() => toggleAthleteSelection(athlete.id)}
                  style={styles.startModalRow}
                >
                  <View
                    style={[
                      styles.startModalCheckbox,
                      isSelected && styles.startModalCheckboxSelected,
                    ]}
                  >
                    {isSelected ? (
                      <FontAwesome name="check" size={12} color="#FFFFFF" />
                    ) : null}
                  </View>

                  <View style={styles.startModalAthleteText}>
                    <Text style={styles.startModalAthleteName}>{athlete.name}</Text>
                    {group ? <Text style={styles.startModalAthleteMeta}>{group.name}</Text> : null}
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={styles.startModalFooter}>
            <BigButton
              title="Cancel"
              onPress={closeStartModal}
              variant="ghost"
              style={styles.startModalFooterButton}
            />
            <BigButton
              title={pendingTemplate ? 'Start Template' : 'Start Workout'}
              onPress={handleConfirmStart}
              disabled={selectedAthleteCount === 0}
              style={styles.startModalFooterButton}
            />
          </View>
        </View>
      </View>
    </Modal>
  );

  const handleSelectTemplate = useCallback(
    async (template: TemplateSummary) => {
      if (athletes.length === 0) return;
      openStartModal(template);
    },
    [athletes, openStartModal]
  );

  const openSaveDialog = useCallback(() => {
    if (templateName) {
      const dateStr = new Date().toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      });
      setWorkoutName(`${templateName} \u2013 ${dateStr}`);
    }
    setShowSave(true);
  }, [templateName]);

  const handleSave = async () => {
    await saveWorkout(workoutName || undefined);
    setShowSave(false);
    setWorkoutName('');
  };

  const handleReset = useCallback(() => {
    Alert.alert('Reset Timers?', 'All splits will be cleared and timers set back to zero.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset', style: 'destructive', onPress: () => resetWorkout() },
    ]);
  }, [resetWorkout]);

  const handleClose = useCallback(() => {
    Alert.alert('Exit Workout?', 'Choose what you want to do with this workout.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Save & Exit', onPress: openSaveDialog },
      { text: 'Discard', style: 'destructive', onPress: discardWorkout },
    ]);
  }, [discardWorkout, openSaveDialog]);

  // ---- Dynamic nav header ----
  useEffect(() => {
    if (isActive) {
      navigation.setOptions({
        headerLeft: () => (
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 }}>
            <Pressable onPress={handleReset}>
              <FontAwesome name="refresh" size={18} color={Colors.textSecondary} />
            </Pressable>
          </View>
        ),
        headerRight: () => (
          <View style={styles.headerActions}>
            <Pressable onPress={() => router.push('/timer/settings')} style={styles.headerIconButton}>
              <FontAwesome name="gear" size={22} color={Colors.textSecondary} />
            </Pressable>
            <Pressable onPress={handleClose} style={styles.headerIconButton}>
              <FontAwesome name="times" size={20} color={Colors.textSecondary} />
            </Pressable>
          </View>
        ),
      });
    } else {
      navigation.setOptions({
        headerLeft: undefined,
        headerRight: () => (
          <Pressable onPress={() => router.push('/timer/settings')} style={styles.headerIconButton}>
            <FontAwesome name="gear" size={22} color={Colors.textSecondary} />
          </Pressable>
        ),
      });
    }
  }, [handleClose, handleReset, isActive, navigation, router]);

  const handleTabPress = useCallback(
    (index: number) => {
      setActiveTabIndex(index);
      scrollViewRef.current?.scrollTo({ x: index * SCREEN_WIDTH, animated: true });
    },
    []
  );

  const handleScrollEnd = useCallback(
    (e: { nativeEvent: { contentOffset: { x: number } } }) => {
      const pageIndex = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
      setActiveTabIndex(pageIndex);
    },
    []
  );

  // ---- Pre-workout screen ----
  if (!isActive) {
    return (
      <SafeAreaView edges={['left', 'right']} style={styles.container}>
        <ScrollView
          contentContainerStyle={styles.preWorkoutContent}
          showsVerticalScrollIndicator={false}
        >
          {athletes.length > 0 ? (
            <>
              <Text style={styles.readyTitle}>Ready to Time</Text>
              <Text style={styles.readySubtitle}>
                {athletes.length} athlete{athletes.length !== 1 ? 's' : ''} on roster
                {groups.length > 0
                  ? ` in ${groups.length} group${groups.length !== 1 ? 's' : ''}`
                  : ''}
              </Text>
              <BigButton
                title="New Workout"
                onPress={handleStartWorkout}
                variant="success"
                size="large"
                style={styles.startButton}
              />

              <View style={styles.templatesSection}>
                <Text style={styles.templatesSectionTitle}>Quick Start from Template</Text>
                {templates.length > 0 ? (
                  <>
                    {templates.slice(0, 5).map((template) => (
                      <Pressable
                        key={template.id}
                        style={({ pressed }) => [
                          styles.templateCard,
                          pressed && styles.templateCardPressed,
                        ]}
                        onPress={() => handleSelectTemplate(template)}
                      >
                        <FontAwesome name="clipboard" size={18} color={Colors.primary} />
                        <View style={styles.templateCardContent}>
                          <Text style={styles.templateCardName} numberOfLines={1}>
                            {template.name}
                          </Text>
                          <Text style={styles.templateCardMeta}>
                            {template.stepCount} step{template.stepCount !== 1 ? 's' : ''}
                          </Text>
                        </View>
                        <FontAwesome name="play-circle" size={28} color={Colors.success} />
                      </Pressable>
                    ))}
                  </>
                ) : (
                  <View style={styles.templateEmptyState}>
                    <Text style={styles.templateEmptyTitle}>No templates yet</Text>
                    <Text style={styles.templateEmptyText}>
                      Create a template to save a workout and start it faster next time.
                    </Text>
                  </View>
                )}
                <Pressable
                  style={styles.createTemplateLink}
                  onPress={() => router.push('/template/new')}
                >
                  <Text style={styles.createTemplateLinkText}>Create Template</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <EmptyState
              title="No Athletes on Roster"
              subtitle="Add athletes in the Roster tab to start timing"
            />
          )}
        </ScrollView>
        {startSelectionModal}
      </SafeAreaView>
    );
  }

  // Helper to get elapsed ms for a block
  const getGroupElapsed = (block: (typeof groupedTimers)[0]) =>
    groupElapsedMap.get(block.groupId ?? '__unassigned') ?? 0;

  // ---- Active workout screen ----
  return (
    <SafeAreaView edges={['left', 'right']} style={styles.container}>
      {showWorkoutStatusStrip && (
        <View style={[styles.stateStrip, { backgroundColor: workoutState.background }]}>
          <View style={[styles.stateDot, { backgroundColor: workoutState.color }]} />
          <Text style={[styles.stateLabel, { color: workoutState.color }]}>{workoutState.label}</Text>
          <Text style={styles.stateDetail}>{workoutState.detail}</Text>
        </View>
      )}

      {/* ===== GROUP TABS ===== */}
      {groupedTimers.length > 1 && (
        <View style={styles.tabBar}>
          {groupedTimers.map((block, index) => {
            const isActiveTab = index === activeTabIndex;
            return (
              <Pressable
                key={block.groupId ?? '__unassigned'}
                onPress={() => handleTabPress(index)}
                style={[
                  styles.tab,
                  isActiveTab && { borderBottomColor: block.groupColor },
                ]}
              >
                <View
                  style={[styles.tabDot, { backgroundColor: block.groupColor }]}
                />
                <Text
                  style={[
                    styles.tabText,
                    isActiveTab && styles.tabTextActive,
                  ]}
                  numberOfLines={1}
                >
                  {block.groupName}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {/* ===== SWIPEABLE GROUP CONTENT ===== */}
      {groupedTimers.length > 1 ? (
        <ScrollView
          ref={scrollViewRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={handleScrollEnd}
          style={styles.pagerScrollView}
        >
          {groupedTimers.map((block) => (
            <View key={block.groupId ?? '__unassigned'} style={styles.page}>
              <ScrollView
                contentContainerStyle={styles.pageScrollContent}
                showsVerticalScrollIndicator={false}
              >
                <GroupTimerSection
                  block={block}
                  groupElapsedMs={getGroupElapsed(block)}
                  displayTick={displayTick}
                  enableAutoReorder={autoReorderAthletes}
                  showTapHints={showTapHints}
                  onStartGroup={() => startGroup(block.groupId)}
                  onStopGroup={() => stopGroup(block.groupId)}
                  onLapGroup={() => lapGroup(block.groupId)}
                  onStartAthlete={startAthlete}
                  onStopAthlete={stopAthlete}
                  onSplitAthlete={recordSplit}
                  onUndoLastSplit={undoLastSplit}
                  athleteProgress={structuredSteps ? athleteProgress : undefined}
                  structuredSteps={structuredSteps}
                  onAdvanceAthlete={structuredSteps ? advanceStep : undefined}
                  onAdvanceGroup={structuredSteps ? () => advanceGroup(block.groupId) : undefined}
                />
              </ScrollView>
            </View>
          ))}
        </ScrollView>
      ) : (
        // Single group — no tabs needed, just scroll vertically
        <ScrollView
          style={styles.singleGroupScroll}
          contentContainerStyle={styles.pageScrollContent}
          showsVerticalScrollIndicator={false}
        >
          {groupedTimers.map((block) => (
            <GroupTimerSection
              key={block.groupId ?? '__unassigned'}
              block={block}
              groupElapsedMs={getGroupElapsed(block)}
              displayTick={displayTick}
              enableAutoReorder={autoReorderAthletes}
              showTapHints={showTapHints}
              onStartGroup={() => startGroup(block.groupId)}
              onStopGroup={() => stopGroup(block.groupId)}
              onLapGroup={() => lapGroup(block.groupId)}
              onStartAthlete={startAthlete}
              onStopAthlete={stopAthlete}
              onSplitAthlete={recordSplit}
              onUndoLastSplit={undoLastSplit}
              athleteProgress={structuredSteps ? athleteProgress : undefined}
              structuredSteps={structuredSteps}
              onAdvanceAthlete={structuredSteps ? advanceStep : undefined}
              onAdvanceGroup={structuredSteps ? () => advanceGroup(block.groupId) : undefined}
            />
          ))}
        </ScrollView>
      )}

      {/* ===== SAVE DIALOG ===== */}
      {showSave && (
        <KeyboardAvoidingView
          style={styles.nameInputOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.nameInputContainer}>
            <Text style={styles.saveTitle}>Save Workout</Text>
            <TextInput
              style={styles.nameInput}
              value={workoutName}
              onChangeText={setWorkoutName}
              placeholder="e.g. Tuesday 400m Repeats"
              placeholderTextColor={Colors.textTertiary}
              autoFocus
            />
            <View style={styles.saveActions}>
              <BigButton
                title="Cancel"
                onPress={() => {
                  setShowSave(false);
                  setWorkoutName('');
                }}
                variant="ghost"
                style={styles.flex}
              />
              <BigButton
                title="Save"
                onPress={handleSave}
                variant="primary"
                style={styles.flex}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      )}

      {startSelectionModal}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  // ---- Pre-workout ----
  preWorkoutContent: {
    flexGrow: 1,
    alignItems: 'center',
    paddingTop: 24,
    paddingHorizontal: Layout.paddingLarge,
    paddingBottom: 40,
  },
  readyTitle: {
    fontSize: Layout.fontSizeTitle,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 8,
  },
  readySubtitle: {
    fontSize: Layout.fontSize,
    color: Colors.textSecondary,
    marginBottom: 32,
    textAlign: 'center',
  },
  startButton: {
    paddingHorizontal: 48,
  },
  // ---- Template cards ----
  templatesSection: {
    width: '100%',
    marginTop: 32,
  },
  templatesSectionTitle: {
    fontSize: Layout.fontSizeSmall,
    fontWeight: '700',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  templateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Layout.borderRadius,
    padding: 14,
    marginBottom: 8,
    gap: 12,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  templateCardPressed: {
    backgroundColor: Colors.surfaceSecondary,
  },
  templateCardContent: {
    flex: 1,
  },
  templateCardName: {
    fontSize: Layout.fontSize,
    fontWeight: '600',
    color: Colors.text,
  },
  templateCardMeta: {
    fontSize: Layout.fontSizeSmall,
    color: Colors.textTertiary,
    marginTop: 1,
  },
  templateEmptyState: {
    backgroundColor: Colors.surface,
    borderRadius: Layout.borderRadius,
    padding: Layout.padding,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    gap: 6,
  },
  templateEmptyTitle: {
    fontSize: Layout.fontSize,
    fontWeight: '600',
    color: Colors.text,
  },
  templateEmptyText: {
    fontSize: Layout.fontSizeSmall,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  createTemplateLink: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  createTemplateLinkText: {
    fontSize: Layout.fontSizeSmall,
    fontWeight: '600',
    color: Colors.primary,
  },
  startModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.3)',
    justifyContent: 'center',
    paddingHorizontal: Layout.paddingLarge,
  },
  startModalCard: {
    maxHeight: '78%',
    backgroundColor: Colors.surface,
    borderRadius: 22,
    padding: Layout.paddingLarge,
    gap: 16,
  },
  startModalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  startModalHeaderText: {
    flex: 1,
    gap: 4,
  },
  startModalTitle: {
    fontSize: Layout.fontSizeLarge,
    fontWeight: '800',
    color: Colors.text,
  },
  startModalSubtitle: {
    fontSize: Layout.fontSize,
    color: Colors.textSecondary,
    lineHeight: 22,
  },
  startModalActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  startModalActionChip: {
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: Colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  startModalActionChipDisabled: {
    backgroundColor: Colors.surface,
    opacity: 0.55,
  },
  startModalActionText: {
    fontSize: Layout.fontSizeSmall,
    fontWeight: '700',
    color: Colors.primary,
  },
  startModalActionTextDisabled: {
    color: Colors.textTertiary,
  },
  startModalCount: {
    marginLeft: 'auto',
    fontSize: Layout.fontSizeSmall,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  startModalList: {
    maxHeight: 360,
  },
  startModalListContent: {
    gap: 8,
  },
  startModalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 58,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  startModalCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
  },
  startModalCheckboxSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  startModalAthleteText: {
    flex: 1,
  },
  startModalAthleteName: {
    fontSize: Layout.fontSize,
    fontWeight: '700',
    color: Colors.text,
  },
  startModalAthleteMeta: {
    marginTop: 2,
    fontSize: Layout.fontSizeSmall,
    color: Colors.textSecondary,
  },
  startModalFooter: {
    flexDirection: 'row',
    gap: 10,
  },
  startModalFooterButton: {
    flex: 1,
  },
  // ---- Tab bar ----
  stateStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: Layout.padding,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  stateDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  stateLabel: {
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  stateDetail: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    gap: 6,
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  tabDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textTertiary,
  },
  tabTextActive: {
    color: Colors.text,
    fontWeight: '700',
  },
  // ---- Pager ----
  pagerScrollView: {
    flex: 1,
  },
  page: {
    width: SCREEN_WIDTH,
  },
  pageScrollContent: {
    paddingBottom: 40,
  },
  singleGroupScroll: {
    flex: 1,
  },
  // ---- Save dialog ----
  nameInputOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Layout.paddingLarge,
  },
  nameInputContainer: {
    backgroundColor: Colors.surface,
    borderRadius: Layout.borderRadius,
    padding: Layout.paddingLarge,
    width: '100%',
    maxWidth: 340,
  },
  saveTitle: {
    fontSize: Layout.fontSizeLarge,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 16,
  },
  nameInput: {
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: Layout.borderRadiusSmall,
    padding: Layout.padding,
    fontSize: Layout.fontSize,
    color: Colors.text,
    marginBottom: 16,
  },
  saveActions: {
    flexDirection: 'row',
    gap: 8,
  },
  flex: {
    flex: 1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerIconButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
});
