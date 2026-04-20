import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Modal,
} from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { useRouter, useNavigation } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useTemplates } from '@/context/TemplateContext';
import DraggableBuilderList from '@/components/template/DraggableBuilderList';
import StepEditor from '@/components/template/StepEditor';
import { Colors } from '@/constants/colors';
import { Layout } from '@/constants/layout';
import { generateId } from '@/utils/id';
import type { BuilderItem, BuilderStep } from '@/types';

function cloneBuilderStep(step: BuilderStep): BuilderStep {
  return { ...step, id: generateId() };
}

export default function NewTemplateScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { createTemplate } = useTemplates();
  const [items, setItems] = useState<BuilderItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  // Step editor modal state
  const [showEditor, setShowEditor] = useState(false);
  const [editingTarget, setEditingTarget] = useState<{
    // null = top-level add, { itemIndex } = edit top-level step,
    // { itemIndex, stepIndex } = edit/add step in repeat group
    itemIndex: number | null;
    stepIndex: number | null;
    initial: BuilderStep | null;
  } | null>(null);

  // Name modal state — shown when user taps Save
  const [showNameModal, setShowNameModal] = useState(false);
  const [nameText, setNameText] = useState('');
  const nameInputRef = useRef<TextInput>(null);

  const handleAddStep = useCallback(() => {
    setEditingTarget({ itemIndex: null, stepIndex: null, initial: null });
    setShowEditor(true);
  }, []);

  const handleAddRepeat = useCallback(() => {
    const workStep: BuilderStep = {
      id: generateId(),
      type: 'work',
      distanceValue: 400,
      distanceUnit: 'm',
      durationMs: null,
      label: '',
    };
    const recoveryStep: BuilderStep = {
      id: generateId(),
      type: 'recovery',
      distanceValue: null,
      distanceUnit: null,
      durationMs: 120000,
      label: '',
    };
    setItems((prev) => [
      ...prev,
      {
        kind: 'repeat',
        group: {
          id: generateId(),
          repeatCount: 4,
          steps: [workStep, recoveryStep],
        },
      },
    ]);
  }, []);

  const handleEditTopStep = useCallback((itemIndex: number) => {
    setItems((prev) => {
      const item = prev[itemIndex];
      if (item.kind === 'step') {
        setEditingTarget({ itemIndex, stepIndex: null, initial: item.step });
        setShowEditor(true);
      }
      return prev;
    });
  }, []);

  const handleDeleteTopItem = useCallback((itemIndex: number) => {
    setItems((prev) => prev.filter((_, i) => i !== itemIndex));
  }, []);

  const handleDuplicateTopStep = useCallback((itemIndex: number) => {
    setItems((prev) => {
      const item = prev[itemIndex];
      if (!item || item.kind !== 'step') return prev;
      const next = [...prev];
      next.splice(itemIndex + 1, 0, { kind: 'step', step: cloneBuilderStep(item.step) });
      return next;
    });
  }, []);

  const handleEditGroupStep = useCallback((itemIndex: number, stepIndex: number) => {
    setItems((prev) => {
      const item = prev[itemIndex];
      if (item.kind === 'repeat') {
        const step = item.group.steps[stepIndex];
        setEditingTarget({ itemIndex, stepIndex, initial: step });
        setShowEditor(true);
      }
      return prev;
    });
  }, []);

  const handleDeleteGroupStep = useCallback((itemIndex: number, stepIndex: number) => {
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== itemIndex || item.kind !== 'repeat') return item;
        const newSteps = item.group.steps.filter((_, si) => si !== stepIndex);
        if (newSteps.length === 0) return null as unknown as BuilderItem; // will filter
        return { ...item, group: { ...item.group, steps: newSteps } };
      }).filter(Boolean)
    );
  }, []);

  const handleAddGroupStep = useCallback((itemIndex: number) => {
    setEditingTarget({ itemIndex, stepIndex: null, initial: null });
    setShowEditor(true);
  }, []);

  const handleDuplicateGroup = useCallback((itemIndex: number) => {
    setItems((prev) => {
      const item = prev[itemIndex];
      if (!item || item.kind !== 'repeat') return prev;
      const duplicated: BuilderItem = {
        kind: 'repeat',
        group: {
          id: generateId(),
          repeatCount: item.group.repeatCount,
          steps: item.group.steps.map((step) => cloneBuilderStep(step)),
        },
      };
      const next = [...prev];
      next.splice(itemIndex + 1, 0, duplicated);
      return next;
    });
  }, []);

  const handleIncrement = useCallback((itemIndex: number) => {
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== itemIndex || item.kind !== 'repeat') return item;
        return { ...item, group: { ...item.group, repeatCount: item.group.repeatCount + 1 } };
      })
    );
  }, []);

  const handleMoveItem = useCallback((fromIndex: number, toIndex: number) => {
    setItems((prev) => {
      if (toIndex < 0 || toIndex >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }, []);

  const handleMoveGroupStep = useCallback((itemIndex: number, fromStepIndex: number, toStepIndex: number) => {
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== itemIndex || item.kind !== 'repeat') return item;
        const steps = [...item.group.steps];
        if (toStepIndex < 0 || toStepIndex >= steps.length) return item;
        const [moved] = steps.splice(fromStepIndex, 1);
        steps.splice(toStepIndex, 0, moved);
        return { ...item, group: { ...item.group, steps } };
      })
    );
  }, []);

  const handleDecrement = useCallback((itemIndex: number) => {
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== itemIndex || item.kind !== 'repeat') return item;
        return {
          ...item,
          group: { ...item.group, repeatCount: Math.max(1, item.group.repeatCount - 1) },
        };
      })
    );
  }, []);

  const handleEditorSave = useCallback(
    (step: BuilderStep) => {
      if (!editingTarget) return;
      const { itemIndex, stepIndex } = editingTarget;

      if (itemIndex === null) {
        // Adding a new top-level step
        setItems((prev) => [...prev, { kind: 'step', step }]);
      } else if (stepIndex === null) {
        // Could be editing a top-level step, or adding a step to a repeat group
        setItems((prev) => {
          const item = prev[itemIndex];
          if (item.kind === 'step' && editingTarget.initial) {
            // Editing existing top-level step
            return prev.map((it, i) => (i === itemIndex ? { kind: 'step', step } : it));
          } else if (item.kind === 'repeat') {
            // Adding a new step to repeat group
            return prev.map((it, i) => {
              if (i !== itemIndex || it.kind !== 'repeat') return it;
              return {
                ...it,
                group: { ...it.group, steps: [...it.group.steps, step] },
              };
            });
          }
          return prev;
        });
      } else {
        // Editing a step inside a repeat group
        setItems((prev) =>
          prev.map((item, i) => {
            if (i !== itemIndex || item.kind !== 'repeat') return item;
            const newSteps = item.group.steps.map((s, si) =>
              si === stepIndex ? step : s
            );
            return { ...item, group: { ...item.group, steps: newSteps } };
          })
        );
      }

      setShowEditor(false);
      setEditingTarget(null);
    },
    [editingTarget]
  );

  // Tapping "Save" in header → validate items, then show naming modal
  const handleSavePress = useCallback(() => {
    if (items.length === 0) {
      Alert.alert('Steps Required', 'Add at least one step to the workout.');
      return;
    }
    setNameText('');
    setShowNameModal(true);
  }, [items]);

  // Confirm save from the naming modal
  const handleConfirmSave = useCallback(async () => {
    if (!nameText.trim()) {
      Alert.alert('Name Required', 'Please enter a name for this workout.');
      return;
    }
    await createTemplate(nameText.trim(), items);
    router.back();
  }, [nameText, items, createTemplate, router]);

  // Set header save button
  React.useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable onPress={handleSavePress} style={{ paddingHorizontal: 8 }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: Colors.primary }}>Save</Text>
        </Pressable>
      ),
    });
  }, [navigation, handleSavePress]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Builder items */}
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} scrollEnabled={!isDragging}>
        {items.length > 0 ? (
          <DraggableBuilderList
            items={items}
            onReorder={handleMoveItem}
            onEditTopStep={handleEditTopStep}
            onDeleteTopItem={handleDeleteTopItem}
            onDuplicateTopStep={handleDuplicateTopStep}
            onEditGroupStep={handleEditGroupStep}
            onDeleteGroupStep={handleDeleteGroupStep}
            onAddGroupStep={handleAddGroupStep}
            onMoveGroupStep={handleMoveGroupStep}
            onIncrement={handleIncrement}
            onDecrement={handleDecrement}
            onDeleteGroup={handleDeleteTopItem}
            onDuplicateGroup={handleDuplicateGroup}
            onDragActiveChange={setIsDragging}
          />
        ) : (
          <View style={styles.emptyHint}>
            <FontAwesome name="puzzle-piece" size={32} color={Colors.textTertiary} />
            <Text style={styles.emptyText}>Add steps or repeat groups to build your workout</Text>
          </View>
        )}
      </ScrollView>

      {/* Bottom action buttons */}
      <View style={styles.bottomBar}>
        <Pressable
          onPress={handleAddStep}
          style={({ pressed }) => [styles.addBtn, pressed && styles.addBtnPressed]}
        >
          <FontAwesome name="plus" size={14} color={Colors.primary} />
          <Text style={styles.addBtnText}>Add Step</Text>
        </Pressable>
        <Pressable
          onPress={handleAddRepeat}
          style={({ pressed }) => [styles.addBtn, pressed && styles.addBtnPressed]}
        >
          <FontAwesome name="repeat" size={14} color={Colors.primary} />
          <Text style={styles.addBtnText}>Add Repeat</Text>
        </Pressable>
      </View>

      {/* Step editor modal layered above New Workout modal */}
      <Modal
        visible={showEditor}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          setShowEditor(false);
          setEditingTarget(null);
        }}
      >
        <StepEditor
          initial={editingTarget?.initial ?? null}
          onSave={handleEditorSave}
          onCancel={() => {
            setShowEditor(false);
            setEditingTarget(null);
          }}
        />
      </Modal>

      {/* Name modal — appears when user taps Save */}
      {showNameModal && (
        <View style={styles.nameOverlay}>
          <Pressable style={styles.nameBackdrop} onPress={() => setShowNameModal(false)} />
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
            style={styles.nameModalWrapper}
          >
            <View style={styles.nameModal}>
              <Text style={styles.nameModalTitle}>Name Your Workout</Text>
              <TextInput
                ref={nameInputRef}
                style={styles.nameInput}
                value={nameText}
                onChangeText={setNameText}
                placeholder="Workout Name"
                placeholderTextColor={Colors.textTertiary}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handleConfirmSave}
              />
              <View style={styles.nameModalButtons}>
                <Pressable
                  onPress={() => setShowNameModal(false)}
                  style={({ pressed }) => [styles.nameModalBtn, pressed && styles.nameModalBtnPressed]}
                >
                  <Text style={styles.nameModalCancel}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={handleConfirmSave}
                  style={({ pressed }) => [
                    styles.nameModalBtn,
                    styles.nameModalSaveBtn,
                    pressed && styles.nameModalSaveBtnPressed,
                  ]}
                >
                  <Text style={styles.nameModalSave}>Save</Text>
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 100,
  },
  emptyHint: {
    alignItems: 'center',
    paddingTop: 60,
    gap: 12,
  },
  emptyText: {
    fontSize: Layout.fontSize,
    color: Colors.textTertiary,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  bottomBar: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: Layout.padding,
    paddingTop: Layout.padding,
    paddingBottom: 34,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  addBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: Layout.borderRadiusSmall,
    backgroundColor: Colors.surfaceSecondary,
  },
  addBtnPressed: {
    backgroundColor: Colors.borderLight,
  },
  addBtnText: {
    fontSize: Layout.fontSize,
    fontWeight: '600',
    color: Colors.primary,
  },
  /* ── Name modal ── */
  nameOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  nameBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  nameModalWrapper: {
    flex: 1,
    width: '100%',
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 72 : 40,
    paddingBottom: Layout.paddingLarge,
    paddingHorizontal: Layout.paddingLarge,
  },
  nameModal: {
    width: '100%',
    backgroundColor: Colors.surface,
    borderRadius: Layout.borderRadius,
    padding: Layout.paddingLarge,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 8,
  },
  nameModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 16,
    textAlign: 'center',
  },
  nameInput: {
    fontSize: Layout.fontSizeLarge,
    fontWeight: '600',
    color: Colors.text,
    padding: Layout.padding,
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: Layout.borderRadiusSmall,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 20,
  },
  nameModalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  nameModalBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: Layout.borderRadiusSmall,
    alignItems: 'center',
    backgroundColor: Colors.surfaceSecondary,
  },
  nameModalBtnPressed: {
    backgroundColor: Colors.borderLight,
  },
  nameModalCancel: {
    fontSize: Layout.fontSize,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  nameModalSaveBtn: {
    backgroundColor: Colors.primary,
  },
  nameModalSaveBtnPressed: {
    backgroundColor: Colors.primaryLight,
  },
  nameModalSave: {
    fontSize: Layout.fontSize,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
