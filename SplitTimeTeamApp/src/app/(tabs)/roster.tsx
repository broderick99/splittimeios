import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  Animated,
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Alert,
  ActionSheetIOS,
  Keyboard,
  Modal,
  Platform,
  RefreshControl,
  TextInput,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  useWindowDimensions,
} from 'react-native';
import { useFocusEffect, useNavigation, useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image as ExpoImage } from 'expo-image';
import Reanimated, {
  LinearTransition,
  ReduceMotion,
} from 'react-native-reanimated';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '@/context/AuthContext';
import { useAnnouncements } from '@/context/AnnouncementContext';
import { useChat } from '@/context/ChatContext';
import { useRoster } from '@/context/RosterContext';
import AthleteListItem from '@/components/roster/AthleteListItem';
import GroupListItem from '@/components/roster/GroupListItem';
import EmptyState from '@/components/ui/EmptyState';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import FloatingAddButton from '@/components/ui/FloatingAddButton';
import { Colors } from '@/constants/colors';
import { Layout } from '@/constants/layout';
import type { Announcement } from '@/types';

type TeamTab = 'overview' | 'roster' | 'chat';
type RosterTab = 'athletes' | 'groups';
const TEAM_TABS: TeamTab[] = ['overview', 'roster', 'chat'];
const CHAT_MESSAGE_GAP = 10;
type PendingChatImage = {
  uri: string;
  fileName: string | null;
  mimeType: string | null;
};
const CHAT_MESSAGE_LAYOUT = LinearTransition
  .duration(180)
  .reduceMotion(ReduceMotion.System);
type CoachOverviewItem =
  | { key: string; type: 'metric'; label: string; value: string }
  | { key: string; type: 'announcement'; announcement: Announcement };
type AthleteOverviewItem =
  | { key: string; type: 'next-practice' }
  | { key: string; type: 'announcement'; announcement: Announcement }
  | { key: string; type: 'team-stats' };

export default function TeamScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const teamPagerRef = useRef<FlatList<TeamTab> | null>(null);
  const chatListRef = useRef<FlatList<any> | null>(null);
  const chatInputRef = useRef<TextInput | null>(null);
  const isSendingChatRef = useRef(false);
  const { session } = useAuth();
  const { announcements, refreshAnnouncements, isLoadingAnnouncements } = useAnnouncements();
  const { messages, refreshMessages, sendMessage, isLoadingMessages } = useChat();
  const {
    athletes,
    groups,
    teamRosterMembers,
    isSyncingTeamRoster,
    teamRosterError,
    hasLoadedTeamRoster,
    updateAthlete,
    deleteAthlete,
    deleteGroup,
    syncTeamRoster,
  } = useRoster();
  const [activeTeamTab, setActiveTeamTab] = useState<TeamTab>('overview');
  const [activeRosterTab, setActiveRosterTab] = useState<RosterTab>('athletes');
  const [isRefreshingOverview, setIsRefreshingOverview] = useState(false);
  const [isRefreshingChat, setIsRefreshingChat] = useState(false);
  const [isChatInputFocused, setIsChatInputFocused] = useState(false);
  const [chatComposerHeight, setChatComposerHeight] = useState(0);
  const [chatKeyboardHeight, setChatKeyboardHeight] = useState(0);
  const chatKeyboardAnim = useRef(new Animated.Value(0)).current;
  const [chatDraft, setChatDraft] = useState('');
  const [pendingChatImage, setPendingChatImage] = useState<PendingChatImage | null>(null);
  const [selectedChatImageUrl, setSelectedChatImageUrl] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    type: 'athlete' | 'group';
    id: string;
    name: string;
  } | null>(null);
  const isCoach = session?.user.role === 'coach';

  const chatBottomInset = (chatComposerHeight || 74) + chatKeyboardHeight + CHAT_MESSAGE_GAP;
  const chatMessages = useMemo(() => [...messages].reverse(), [messages]);

  useEffect(() => {
    if (activeTeamTab !== 'chat') {
      return;
    }

    requestAnimationFrame(() => {
      chatListRef.current?.scrollToOffset({ offset: 0, animated: false });
    });
  }, [activeTeamTab]);

  const getGroupForAthlete = useCallback(
    (groupId: string | null) => groups.find((g) => g.id === groupId),
    [groups]
  );

  const getAthleteCountForGroup = useCallback(
    (groupId: string) => athletes.filter((a) => a.groupId === groupId).length,
    [athletes]
  );

  const remoteAthleteMembers = useMemo(
    () => teamRosterMembers.filter((member) => member.role === 'athlete'),
    [teamRosterMembers]
  );

  const displayAthletes = useMemo(() => {
    if (!hasLoadedTeamRoster) {
      return athletes;
    }

    const mergedAthletes = [...athletes];
    const existingIds = new Set(athletes.map((athlete) => athlete.id));

    for (const member of remoteAthleteMembers) {
      const name = `${member.firstName} ${member.lastName}`.trim();
      const localAthlete =
        athletes.find((athlete) => athlete.remoteUserId === member.id) ??
        athletes.find((athlete) => athlete.name.trim().toLowerCase() === name.toLowerCase());

      if (localAthlete) {
        continue;
      }

      const remotePlaceholderId = `remote-${member.id}`;
      if (existingIds.has(remotePlaceholderId)) {
        continue;
      }

      mergedAthletes.push({
        id: remotePlaceholderId,
        remoteUserId: member.id,
        name,
        firstName: member.firstName,
        lastName: member.lastName,
        email: member.email,
        phone: member.phone,
        age: member.age,
        grade: member.grade,
        groupId: null,
        photoUri: null,
        createdAt: 0,
      });
    }

    return mergedAthletes.sort((left, right) => left.name.localeCompare(right.name));
  }, [athletes, hasLoadedTeamRoster, remoteAthleteMembers]);

  const coachMember = useMemo(
    () => teamRosterMembers.find((member) => member.role === 'coach') ?? null,
    [teamRosterMembers]
  );

  const coachName = useMemo(() => {
    if (coachMember) {
      return `${coachMember.firstName} ${coachMember.lastName}`.trim() || 'Coach';
    }

    if (!session) {
      return 'Coach';
    }

    return `${session.user.firstName} ${session.user.lastName}`.trim() || 'Coach';
  }, [coachMember, session]);

  const formattedAnnouncementDates = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    return new Map(
      announcements.map((announcement) => [
        announcement.id,
        formatter.format(new Date(announcement.createdAt)),
      ])
    );
  }, [announcements]);

  const coachOverviewItems = useMemo<CoachOverviewItem[]>(
    () => [
      { key: 'joined', type: 'metric', label: 'Athletes Joined', value: String(displayAthletes.length) },
      { key: 'groups', type: 'metric', label: 'Groups Built', value: String(groups.length) },
      { key: 'join-code', type: 'metric', label: 'Team Join Code', value: session?.team?.joinCode ?? '--' },
      ...announcements.map((announcement) => ({
        key: announcement.id,
        type: 'announcement' as const,
        announcement,
      })),
    ],
    [announcements, displayAthletes.length, groups.length, session?.team?.joinCode]
  );

  const athleteOverviewItems = useMemo<AthleteOverviewItem[]>(
    () => [
      { key: 'next-practice', type: 'next-practice' },
      ...announcements.map((announcement) => ({
        key: announcement.id,
        type: 'announcement' as const,
        announcement,
      })),
      { key: 'team-stats', type: 'team-stats' },
    ],
    [announcements]
  );

  const handleSyncRoster = useCallback(async (options?: { silent?: boolean }) => {
    try {
      await syncTeamRoster();
    } catch {
      if (!options?.silent) {
        // Team roster errors are shown inline below the overview header.
      }
    }
  }, [syncTeamRoster]);

  useFocusEffect(
    useCallback(() => {
      void handleSyncRoster({ silent: true });
      void refreshAnnouncements();
      void refreshMessages({ silent: true });
      return undefined;
    }, [handleSyncRoster, refreshAnnouncements, refreshMessages])
  );

  useEffect(() => {
    if (activeTeamTab !== 'chat' || !session) {
      return undefined;
    }

    const interval = setInterval(() => {
      void refreshMessages({ silent: true });
    }, 6000);

    return () => {
      clearInterval(interval);
    };
  }, [activeTeamTab, refreshMessages, session]);

  useEffect(() => {
    const TAB_BAR_HEIGHT = 88;
    const onShow = (e: any) => {
      const kbHeight = e?.endCoordinates?.height ?? 0;
      const liftAboveTabBar = Math.max(0, kbHeight - TAB_BAR_HEIGHT);
      setChatKeyboardHeight(liftAboveTabBar);
      Animated.timing(chatKeyboardAnim, {
        toValue: liftAboveTabBar,
        duration: Platform.OS === 'ios' ? (e.duration ?? 250) : 250,
        useNativeDriver: false,
      }).start();
    };

    const onHide = (e: any) => {
      setChatKeyboardHeight(0);
      Animated.timing(chatKeyboardAnim, {
        toValue: 0,
        duration: Platform.OS === 'ios' ? (e?.duration ?? 250) : 250,
        useNativeDriver: false,
      }).start();
    };

    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const s1 = Keyboard.addListener(showEvent, onShow);
    const s2 = Keyboard.addListener(hideEvent, onHide);
    return () => {
      s1.remove();
      s2.remove();
    };
  }, [chatKeyboardAnim, insets.bottom]);

  const launchLibrary = useCallback(async (athleteId: string) => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
    });
    if (!result.canceled && result.assets[0]) {
      await updateAthlete(athleteId, { photoUri: result.assets[0].uri });
    }
  }, [updateAthlete]);

  const launchCamera = useCallback(async (athleteId: string) => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Needed', 'Camera access is required to take a photo.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
    });
    if (!result.canceled && result.assets[0]) {
      await updateAthlete(athleteId, { photoUri: result.assets[0].uri });
    }
  }, [updateAthlete]);

  const handlePhotoPress = useCallback((athleteId: string) => {
    if (athleteId.startsWith('remote-')) {
      Alert.alert('Syncing Athlete', 'This athlete is still syncing into the local roster.');
      return;
    }

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Cancel', 'Take Photo', 'Choose from Library'],
          cancelButtonIndex: 0,
        },
        (buttonIndex) => {
          if (buttonIndex === 1) {
            void launchCamera(athleteId);
          } else if (buttonIndex === 2) {
            void launchLibrary(athleteId);
          }
        }
      );
      return;
    }

    Alert.alert('Add Photo', '', [
      { text: 'Take Photo', onPress: () => void launchCamera(athleteId) },
      { text: 'Choose from Library', onPress: () => void launchLibrary(athleteId) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [launchCamera, launchLibrary]);

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    if (deleteTarget.type === 'athlete') {
      await deleteAthlete(deleteTarget.id);
    } else {
      await deleteGroup(deleteTarget.id);
    }
    setDeleteTarget(null);
  };

  const handleRefreshOverview = useCallback(async () => {
    setIsRefreshingOverview(true);
    try {
      await Promise.all([
        syncTeamRoster().catch(() => {
          // Inline error state already covers roster refresh failures.
        }),
        refreshAnnouncements().catch(() => {
          // Announcement refresh can fail independently without breaking pull-to-refresh.
        }),
      ]);
    } finally {
      setIsRefreshingOverview(false);
    }
  }, [refreshAnnouncements, syncTeamRoster]);

  const handleRefreshChat = useCallback(async () => {
    setIsRefreshingChat(true);
    try {
      await refreshMessages();
    } finally {
      setIsRefreshingChat(false);
    }
  }, [refreshMessages]);

  const handleSendChat = useCallback(async () => {
    if (isSendingChatRef.current) {
      return;
    }

    if (!chatDraft.trim() && !pendingChatImage) {
      return;
    }

    isSendingChatRef.current = true;
    const body = chatDraft.trim();
    const image = pendingChatImage;

    try {
      if (body && image) {
        await sendMessage({ image });
        await sendMessage({ body });
      } else {
        await sendMessage({ body, image: image ?? undefined });
      }

      setChatDraft('');
      setPendingChatImage(null);
    } catch {
      Alert.alert('Could not send', 'Please try sending that message again.');
    } finally {
      isSendingChatRef.current = false;
    }
  }, [chatDraft, pendingChatImage, sendMessage]);

  const handleSelectChatPhoto = useCallback(
    async (source: 'camera' | 'library') => {
      if (source === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (permission.status !== 'granted') {
          Alert.alert('Permission Needed', 'Camera access is required to take a photo.');
          return;
        }
      }

      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync({
              mediaTypes: ['images'],
              allowsEditing: true,
              aspect: [4, 4],
              quality: 0.75,
            })
          : await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ['images'],
              allowsEditing: true,
              aspect: [4, 4],
              quality: 0.75,
            });

      if (result.canceled || !result.assets[0]) {
        return;
      }

      const asset = result.assets[0];

      setPendingChatImage({
        uri: asset.uri,
        fileName: asset.fileName ?? null,
        mimeType: asset.mimeType ?? asset.type ?? 'image/jpeg',
      });
    },
    []
  );

  const handleChatCameraPress = useCallback(() => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Cancel', 'Take Photo', 'Choose from Library'],
          cancelButtonIndex: 0,
        },
        (buttonIndex) => {
          if (buttonIndex === 1) {
            void handleSelectChatPhoto('camera');
          } else if (buttonIndex === 2) {
            void handleSelectChatPhoto('library');
          }
        }
      );
      return;
    }

    Alert.alert('Add Photo', '', [
      { text: 'Take Photo', onPress: () => void handleSelectChatPhoto('camera') },
      { text: 'Choose from Library', onPress: () => void handleSelectChatPhoto('library') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [handleSelectChatPhoto]);

  const handleChatInputFocus = useCallback(() => {
    setIsChatInputFocused(true);
  }, []);

  const handleChatInputBlur = useCallback(() => {
    setIsChatInputFocused(false);
  }, []);

  const handleTeamTabPress = useCallback((tab: TeamTab) => {
    const switchTab = () => {
      setActiveTeamTab(tab);
      teamPagerRef.current?.scrollToIndex({
        index: TEAM_TABS.indexOf(tab),
        animated: true,
      });
    };

    if (activeTeamTab === 'chat' && isChatInputFocused && tab !== 'chat') {
      Keyboard.dismiss();
      setTimeout(switchTab, 120);
      return;
    }

    switchTab();
  }, [activeTeamTab, isChatInputFocused]);

  const handleTeamPagerEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const nextIndex = Math.round(event.nativeEvent.contentOffset.x / width);
      const nextTab = TEAM_TABS[nextIndex];

      if (nextTab) {
        if (nextTab !== 'chat') {
          Keyboard.dismiss();
        }
        setActiveTeamTab(nextTab);
      }
    },
    [width]
  );

  const overviewPage = isCoach ? (
    <FlatList
      data={coachOverviewItems}
      keyExtractor={(item) => item.key}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshingOverview || isSyncingTeamRoster || isLoadingAnnouncements}
          onRefresh={() => void handleRefreshOverview()}
          tintColor={Colors.primary}
        />
      }
      ListHeaderComponent={
        <View style={styles.overviewHeader}>
          <Text style={styles.teamName}>{session?.team?.name ?? 'Your Team'}</Text>
          <Text style={styles.teamMeta}>Coach: {coachName}</Text>
          <Text style={styles.teamMeta}>
            Athlete signups from this team code sync into the app roster automatically.
          </Text>
          {teamRosterError && <Text style={styles.syncError}>{teamRosterError}</Text>}
        </View>
      }
      ListEmptyComponent={null}
      ListFooterComponent={
        announcements.length === 0 ? (
          <View style={styles.metricCard}>
            <Text style={styles.feedCardTitle}>Announcements</Text>
            <Text style={styles.feedCardBody}>No announcements yet.</Text>
            <Text style={styles.feedCardHint}>
              Tap the + in the top right to post your first team update.
            </Text>
          </View>
        ) : null
      }
      renderItem={({ item }) => {
        if (item.type === 'announcement') {
          return (
            <AnnouncementCard
              title={item.announcement.title}
              body={item.announcement.body}
              authorName={item.announcement.authorName}
              dateLabel={formattedAnnouncementDates.get(item.announcement.id) ?? ''}
            />
          );
        }

        return (
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{item.value}</Text>
            <Text style={styles.metricLabel}>{item.label}</Text>
          </View>
        );
      }}
      contentContainerStyle={styles.overviewContent}
    />
  ) : (
    <FlatList
      data={athleteOverviewItems}
      keyExtractor={(item) => item.key}
      contentContainerStyle={styles.overviewContent}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshingOverview || isSyncingTeamRoster || isLoadingAnnouncements}
          onRefresh={() => void handleRefreshOverview()}
          tintColor={Colors.primary}
        />
      }
      ListHeaderComponent={
        <View style={styles.overviewHeader}>
          <Text style={styles.teamName}>{session?.team?.name ?? 'Your Team'}</Text>
          <Text style={styles.teamMeta}>Coach: {coachName}</Text>
          {teamRosterError && <Text style={styles.syncError}>{teamRosterError}</Text>}
        </View>
      }
      renderItem={({ item }) => {
        if (item.type === 'next-practice') {
          return (
            <View style={styles.metricCard}>
              <Text style={styles.feedCardTitle}>Next Practice</Text>
              <Text style={styles.feedCardBody}>Schedule coming soon.</Text>
              <Text style={styles.feedCardHint}>
                This is where the next practice time, location, and notes will show up.
              </Text>
            </View>
          );
        }

        if (item.type === 'announcement') {
          return (
            <AnnouncementCard
              title={item.announcement.title}
              body={item.announcement.body}
              authorName={item.announcement.authorName}
              dateLabel={formattedAnnouncementDates.get(item.announcement.id) ?? ''}
            />
          );
        }

        return (
          <View style={styles.metricCard}>
            <Text style={styles.feedCardTitle}>Team Snapshot</Text>
            <Text style={styles.feedCardBody}>
              {displayAthletes.length} athlete{displayAthletes.length !== 1 ? 's' : ''} on the team
            </Text>
            <Text style={styles.feedCardHint}>Roster and updates all in one place.</Text>
          </View>
        );
      }}
      ListFooterComponent={
        announcements.length === 0 ? (
          <View style={styles.metricCard}>
            <Text style={styles.feedCardTitle}>Announcements</Text>
            <Text style={styles.feedCardBody}>No announcements yet.</Text>
            <Text style={styles.feedCardHint}>
              Coaches will post races, reminders, and team updates here.
            </Text>
          </View>
        ) : null
      }
    />
  );

  const rosterPage = (
    <>
      {isCoach && (
        <View style={styles.rosterTabBar}>
          <Pressable
            style={[styles.rosterTab, activeRosterTab === 'athletes' && styles.rosterTabActive]}
            onPress={() => setActiveRosterTab('athletes')}
          >
            <Text
              style={[
                styles.rosterTabText,
                activeRosterTab === 'athletes' && styles.rosterTabTextActive,
              ]}
            >
              Athletes ({displayAthletes.length})
            </Text>
          </Pressable>
          <Pressable
            style={[styles.rosterTab, activeRosterTab === 'groups' && styles.rosterTabActive]}
            onPress={() => setActiveRosterTab('groups')}
          >
            <Text
              style={[
                styles.rosterTabText,
                activeRosterTab === 'groups' && styles.rosterTabTextActive,
              ]}
            >
              Groups ({groups.length})
            </Text>
          </Pressable>
        </View>
      )}

      {activeRosterTab === 'athletes' || !isCoach ? (
        <FlatList
          data={displayAthletes}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <AthleteListItem
              athlete={item}
              group={getGroupForAthlete(item.groupId)}
              onPress={() => router.push(`/athlete/${item.id}`)}
              onPhotoPress={() => handlePhotoPress(item.id)}
              onDelete={() =>
                item.id.startsWith('remote-')
                  ? Alert.alert(
                      'Syncing Athlete',
                      'This athlete is still syncing into the local roster.'
                    )
                  : setDeleteTarget({ type: 'athlete', id: item.id, name: item.name })
              }
              photoEditable={isCoach}
              showDeleteAction={isCoach}
              showGroupLabel={isCoach}
            />
          )}
          ListEmptyComponent={
            isSyncingTeamRoster ? (
              <View style={styles.loadingState}>
                <ActivityIndicator size="small" color={Colors.primary} />
                <Text style={styles.loadingText}>Syncing team roster...</Text>
              </View>
            ) : (
              <EmptyState
                title="No Athletes Yet"
                subtitle="Athletes who join with your code will appear here automatically."
              />
            )
          }
          contentContainerStyle={displayAthletes.length === 0 ? styles.emptyList : undefined}
        />
      ) : (
        <FlatList
          data={groups}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <GroupListItem
              group={item}
              athleteCount={getAthleteCountForGroup(item.id)}
              onPress={() => {
                if (isCoach) {
                  router.push(`/group/${item.id}`);
                }
              }}
              onDelete={() =>
                setDeleteTarget({ type: 'group', id: item.id, name: item.name })
              }
              showDeleteAction={isCoach}
            />
          )}
          ListEmptyComponent={
            <EmptyState
              title="No Groups Yet"
              subtitle="Create groups to organize the team roster."
            />
          }
          contentContainerStyle={groups.length === 0 ? styles.emptyList : undefined}
        />
      )}

      {isCoach && activeTeamTab === 'roster' ? (
        <FloatingAddButton
          accessibilityLabel={activeRosterTab === 'athletes' ? 'Add athlete' : 'Add group'}
          onPress={() =>
            router.push(activeRosterTab === 'athletes' ? '/athlete/new' : '/group/new')
          }
        />
      ) : null}
    </>
  );

  const chatPage = (
    <View style={styles.chatPage}>
      <Reanimated.FlatList
        ref={chatListRef}
        data={chatMessages}
        inverted
        itemLayoutAnimation={CHAT_MESSAGE_LAYOUT}
        maintainVisibleContentPosition={{
          minIndexForVisible: 0,
          autoscrollToTopThreshold: 40,
        }}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          messages.length === 0 ? styles.emptyList : styles.chatList,
          { paddingTop: chatBottomInset },
        ]}
        automaticallyAdjustContentInsets={false}
        keyboardShouldPersistTaps="always"
        keyboardDismissMode="interactive"
        directionalLockEnabled
        nestedScrollEnabled
        scrollEnabled
        refreshControl={
          <RefreshControl
            refreshing={isRefreshingChat || isLoadingMessages}
            onRefresh={() => void handleRefreshChat()}
            tintColor={Colors.primary}
          />
        }
        renderItem={({ item }) => {
          const isOwnMessage = item.senderUserId === session?.user.id;
          const isImageOnlyMessage = Boolean(item.imageUrl) && !item.body;
          return (
            <View
              style={[
                styles.chatBubbleRow,
                isOwnMessage ? styles.chatBubbleRowOwn : styles.chatBubbleRowOther,
              ]}
            >
              <View style={isOwnMessage ? styles.chatBubbleWrapOwn : styles.chatBubbleWrapOther}>
                <View
                  style={[
                    styles.chatBubble,
                    isImageOnlyMessage && styles.chatBubbleImageOnly,
                    isOwnMessage ? styles.chatBubbleOwn : styles.chatBubbleOther,
                    isImageOnlyMessage && styles.chatBubbleImageTone,
                  ]}
                >
                  {!isOwnMessage && (
                    <Text style={styles.chatSender}>
                      {item.senderName}
                      {item.senderRole === 'coach' ? ' · Coach' : ''}
                    </Text>
                  )}
                  {item.imageUrl ? (
                    <Pressable onPress={() => setSelectedChatImageUrl(item.imageUrl)} hitSlop={6}>
                      <ExpoImage
                        source={{ uri: item.imageUrl }}
                        contentFit="cover"
                        style={styles.chatImage}
                      />
                    </Pressable>
                  ) : null}
                  {item.body ? (
                    <Text style={[styles.chatBody, isOwnMessage && styles.chatBodyOwn]}>
                      {item.body}
                    </Text>
                  ) : null}
                </View>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.chatEmptyState}>
            <EmptyState
              title="No Messages Yet"
              subtitle="Start the team chat by sending the first message."
            />
          </View>
        }
      />

      <Animated.View
        style={[
          styles.chatComposerWrap,
          { transform: [{ translateY: Animated.multiply(chatKeyboardAnim, -1) }] },
        ]}
        onLayout={(event: any) => {
          const h = Math.ceil(event.nativeEvent.layout.height);
          if (h > 0 && h !== chatComposerHeight) setChatComposerHeight(h);
        }}
      >
        <View style={styles.chatComposer}>
          {pendingChatImage ? (
            <View style={styles.chatAttachmentPreview}>
              <ExpoImage
                source={{ uri: pendingChatImage.uri }}
                contentFit="cover"
                style={styles.chatAttachmentImage}
              />
              <Pressable
                style={styles.chatAttachmentRemove}
                onPress={() => setPendingChatImage(null)}
                hitSlop={8}
              >
                <Ionicons name="close-circle" size={20} color={Colors.text} />
              </Pressable>
            </View>
          ) : null}
          <View style={styles.chatComposerRow}>
            <Pressable
              style={styles.chatCameraButton}
              onPress={() => void handleChatCameraPress()}
              hitSlop={8}
            >
              <Ionicons name="camera-outline" size={22} color={Colors.primary} />
            </Pressable>
            <TextInput
              ref={chatInputRef}
              value={chatDraft}
              onChangeText={setChatDraft}
              onFocus={handleChatInputFocus}
              onBlur={handleChatInputBlur}
              placeholder="Send a message"
              placeholderTextColor={Colors.textTertiary}
              style={styles.chatInput}
              returnKeyType="send"
              submitBehavior="submit"
              onSubmitEditing={() => void handleSendChat()}
              blurOnSubmit={false}
              multiline
            />
            <Pressable
              style={[
                styles.chatSendButton,
                !chatDraft.trim() && !pendingChatImage && styles.chatSendButtonDisabled,
              ]}
              hitSlop={12}
              onPress={() => void handleSendChat()}
              disabled={!chatDraft.trim() && !pendingChatImage}
            >
              <Ionicons
                name="arrow-up"
                size={20}
                color={!chatDraft.trim() && !pendingChatImage ? Colors.textTertiary : '#FFFFFF'}
              />
            </Pressable>
          </View>
        </View>
      </Animated.View>
    </View>
  );

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: undefined,
    });
  }, [navigation]);

  return (
    <>
      <SafeAreaView edges={['left', 'right']} style={styles.container}>
        <View style={styles.teamTabBar}>
          <Pressable
            style={[styles.teamTab, activeTeamTab === 'overview' && styles.teamTabActive]}
            onPress={() => handleTeamTabPress('overview')}
          >
            <Text
              style={[
                styles.teamTabText,
                activeTeamTab === 'overview' && styles.teamTabTextActive,
              ]}
            >
              Overview
            </Text>
          </Pressable>
          <Pressable
            style={[styles.teamTab, activeTeamTab === 'roster' && styles.teamTabActive]}
            onPress={() => handleTeamTabPress('roster')}
          >
            <Text
              style={[
                styles.teamTabText,
                activeTeamTab === 'roster' && styles.teamTabTextActive,
              ]}
            >
              Roster
            </Text>
          </Pressable>
          <Pressable
            style={[styles.teamTab, activeTeamTab === 'chat' && styles.teamTabActive]}
            onPress={() => handleTeamTabPress('chat')}
          >
            <Text
              style={[
                styles.teamTabText,
                activeTeamTab === 'chat' && styles.teamTabTextActive,
              ]}
            >
              Chat
            </Text>
          </Pressable>
        </View>

        <FlatList
          ref={teamPagerRef}
          data={TEAM_TABS}
          keyExtractor={(item) => item}
          style={styles.teamPager}
          horizontal
          pagingEnabled
          bounces={false}
          directionalLockEnabled
          scrollEnabled={activeTeamTab !== 'chat'}
          keyboardShouldPersistTaps="always"
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={handleTeamPagerEnd}
          renderItem={({ item }) => (
            <View style={[styles.teamPage, { width }]}>
              {item === 'overview' && overviewPage}
              {item === 'roster' && rosterPage}
              {item === 'chat' && chatPage}
            </View>
          )}
        />

        {isCoach && (
          <ConfirmDialog
            visible={deleteTarget !== null}
            title={`Delete ${deleteTarget?.type === 'athlete' ? 'Athlete' : 'Group'}?`}
            message={
              deleteTarget?.type === 'group'
                ? `"${deleteTarget.name}" will be deleted. Athletes in this group will become unassigned.`
                : `"${deleteTarget?.name}" will be removed from the roster.`
            }
            confirmLabel="Delete"
            destructive
            onConfirm={handleConfirmDelete}
            onCancel={() => setDeleteTarget(null)}
          />
        )}

        {isCoach && activeTeamTab === 'overview' ? (
          <FloatingAddButton
            accessibilityLabel="Add announcement"
            onPress={() => router.push('/announcement/new')}
          />
        ) : null}
      </SafeAreaView>

      <Modal
        visible={selectedChatImageUrl !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedChatImageUrl(null)}
      >
        <View style={styles.chatImageViewerBackdrop}>
          <Pressable
            style={styles.chatImageViewerClose}
            onPress={() => setSelectedChatImageUrl(null)}
            hitSlop={10}
          >
            <Ionicons name="close" size={28} color="#FFFFFF" />
          </Pressable>
          <Pressable
            style={styles.chatImageViewerContent}
            onPress={() => setSelectedChatImageUrl(null)}
          >
            {selectedChatImageUrl ? (
              <ExpoImage
                source={{ uri: selectedChatImageUrl }}
                contentFit="contain"
                style={styles.chatImageViewerImage}
              />
            ) : null}
          </Pressable>
        </View>
      </Modal>
    </>
  );
}

function AnnouncementCard({
  title,
  body,
  authorName,
  dateLabel,
}: {
  title: string;
  body: string;
  authorName: string;
  dateLabel: string;
}) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.announcementTitle}>{title}</Text>
      <Text style={styles.announcementBody}>{body}</Text>
      <Text style={styles.announcementMeta}>
        {authorName}
        {dateLabel ? ` · ${dateLabel}` : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  teamTabBar: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    paddingHorizontal: Layout.padding,
    paddingTop: 10,
    paddingBottom: 6,
    gap: 4,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  teamTab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  teamTabActive: {
    borderBottomColor: Colors.primary,
  },
  teamTabText: {
    fontSize: Layout.fontSize,
    fontWeight: '600',
    color: Colors.textTertiary,
  },
  teamTabTextActive: {
    color: Colors.primary,
  },
  teamPager: {
    flex: 1,
  },
  teamPage: {
    flex: 1,
  },
  overviewContent: {
    padding: Layout.padding,
    gap: 12,
    paddingBottom: 30,
  },
  overviewHeader: {
    backgroundColor: Colors.surface,
    borderRadius: Layout.borderRadius,
    padding: Layout.paddingLarge,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  teamName: {
    fontSize: Layout.fontSizeTitle,
    fontWeight: '800',
    color: Colors.text,
  },
  teamMeta: {
    marginTop: 6,
    fontSize: Layout.fontSizeSmall,
    lineHeight: 19,
    color: Colors.textSecondary,
  },
  syncError: {
    marginTop: 14,
    fontSize: Layout.fontSizeSmall,
    color: Colors.danger,
    fontWeight: '600',
  },
  metricCard: {
    backgroundColor: Colors.surface,
    borderRadius: Layout.borderRadius,
    padding: Layout.paddingLarge,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  metricValue: {
    fontSize: 30,
    fontWeight: '800',
    color: Colors.text,
  },
  metricLabel: {
    marginTop: 4,
    fontSize: Layout.fontSizeSmall,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  feedCardTitle: {
    fontSize: Layout.fontSizeLarge,
    fontWeight: '800',
    color: Colors.text,
  },
  feedCardBody: {
    marginTop: 10,
    fontSize: Layout.fontSize,
    lineHeight: 22,
    color: Colors.text,
  },
  feedCardHint: {
    marginTop: 8,
    fontSize: Layout.fontSizeSmall,
    lineHeight: 20,
    color: Colors.textSecondary,
  },
  announcementTitle: {
    fontSize: Layout.fontSizeLarge,
    fontWeight: '800',
    color: Colors.text,
  },
  announcementBody: {
    marginTop: 10,
    fontSize: Layout.fontSize,
    lineHeight: 23,
    color: Colors.text,
  },
  announcementMeta: {
    marginTop: 12,
    fontSize: Layout.fontSizeSmall,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  rosterTabBar: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    paddingHorizontal: Layout.padding,
    paddingTop: 8,
    gap: 4,
  },
  rosterTab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  rosterTabActive: {
    borderBottomColor: Colors.primary,
  },
  rosterTabText: {
    fontSize: Layout.fontSize,
    fontWeight: '600',
    color: Colors.textTertiary,
  },
  rosterTabTextActive: {
    color: Colors.primary,
  },
  chatPage: {
    flex: 1,
    backgroundColor: Colors.background,
    overflow: 'hidden',
  },
  chatList: {
    flexGrow: 1,
    paddingHorizontal: Layout.padding,
    paddingBottom: Layout.padding,
    gap: CHAT_MESSAGE_GAP,
  },
  chatEmptyState: {
    transform: [{ scaleY: -1 }],
  },
  chatBubbleRow: {
    flexDirection: 'row',
  },
  chatBubbleRowOwn: {
    justifyContent: 'flex-end',
  },
  chatBubbleRowOther: {
    justifyContent: 'flex-start',
  },
  chatBubbleWrapOwn: {
    alignSelf: 'flex-end',
    maxWidth: '82%',
  },
  chatBubbleWrapOther: {
    alignSelf: 'flex-start',
    maxWidth: '82%',
  },
  chatBubble: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
  },
  chatBubbleOwn: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  chatBubbleOther: {
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
  },
  chatBubbleImageOnly: {
    paddingHorizontal: 0,
    paddingVertical: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
  },
  chatBubbleImageTone: {
    borderColor: 'transparent',
    backgroundColor: 'transparent',
  },
  chatSender: {
    fontSize: Layout.fontSizeSmall,
    fontWeight: '700',
    color: Colors.textSecondary,
    marginBottom: 6,
  },
  chatBody: {
    marginTop: 2,
    fontSize: Layout.fontSize,
    lineHeight: 22,
    color: Colors.text,
  },
  chatBodyOwn: {
    color: '#FFFFFF',
  },
  chatImage: {
    width: 220,
    height: 220,
    borderRadius: 16,
    marginBottom: 8,
    overflow: 'hidden',
    backgroundColor: Colors.surfaceSecondary,
  },
  chatImageViewerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(10, 12, 18, 0.96)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  chatImageViewerClose: {
    position: 'absolute',
    top: 54,
    right: 20,
    zIndex: 2,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  chatImageViewerContent: {
    width: '100%',
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 80,
  },
  chatImageViewerImage: {
    width: '100%',
    height: '100%',
  },
  chatComposerWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  chatComposer: {
    gap: 10,
    paddingHorizontal: Layout.padding,
    paddingTop: 10,
    paddingBottom: 10,
  },
  chatComposerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
  },
  chatAttachmentPreview: {
    alignSelf: 'flex-start',
    marginLeft: 52,
    marginBottom: 2,
    position: 'relative',
  },
  chatAttachmentImage: {
    width: 84,
    height: 84,
    borderRadius: 16,
    backgroundColor: Colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chatAttachmentRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    borderRadius: 10,
    backgroundColor: Colors.surface,
  },
  chatCameraButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF4FF',
    borderWidth: 1,
    borderColor: '#D6E4FF',
    marginBottom: 3,
  },
  chatInput: {
    flex: 1,
    minHeight: 42,
    maxHeight: 120,
    backgroundColor: '#F2F4F7',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: Layout.fontSize,
    color: Colors.text,
  },
  chatSendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    marginBottom: 3,
  },
  chatSendButtonDisabled: {
    backgroundColor: Colors.surfaceSecondary,
  },
  emptyList: {
    flexGrow: 1,
  },
  loadingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingTop: 60,
  },
  loadingText: {
    fontSize: Layout.fontSize,
    color: Colors.textSecondary,
  },
});
