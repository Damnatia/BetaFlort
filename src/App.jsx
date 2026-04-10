import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from './supabase';
import { useAuth } from './hooks/useAuth';

const ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD;
const ADMIN_PASSWORD2 = import.meta.env.VITE_ADMIN_PASSWORD2;
const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY;

const initialProfile = { name: '', age: '', city: '', gender: '', hobbies: '', photo_url: '' };
const initialMemberProfile = { age: '', hobbies: '', city: '', photo_url: '', status_emoji: '🙂', coin_balance: 100, contact_phone: '' };
const COIN_COST_PER_MESSAGE = 20;
const TEST_CONTACT_NUMBER = '5552083092';
const DEFAULT_CHECKOUT_ENDPOINT = '/api/create-checkout-session';

const NAME_SEEDS = [
  'Alara','Asya','Defne','Nehir','Derin','Lina','Mira','Arya','Ela','Ada','Duru','Elif','Zeynep','Eylül','İdil','İpek','Mina','Nisa','Sude','Su','Beren','Naz','Aylin','Yaren','Lara','Selin','Melis','Ayşe','Buse','Ceren','Yasemin','Sena','Gizem','Selen','Nehir','Yelda','Esila','İrem','Tuana','Merve','Hilal','Nisanur','Ece','Nazlı','Güneş','Ecrin','Hazal','Helin','Sıla','Berfin','Damla','Sinem','Yağmur','Derya','Pelin','Cansu','Gökçe','Deniz','Meryem','Beste','Aden','Alina','Maya','Sahara','Lavin','Lavinya','Rüya','Nehirsu','Miray','Sahra','Mina','Nehirnaz','Aysu','Melisa','Zümra','Ecrinsu','Asel','Rabia','Nursena','Pınar','Leman','Öykü','Çağla','Açelya','Irmak','Ahu','Nehircan','Beliz','Elvan','Ayça','Mislina','Mislinay','Aren','Arven','Helia','Hira','Yüsra','Elisa','Liya','Mona','Noa','Talia'
];
const NAME_SUFFIXES = ['', ' Nur', ' Su', ' Naz', ' Ada'];
const FEMALE_NAMES = Array.from(new Set(NAME_SEEDS.flatMap((seed) => NAME_SUFFIXES.map((s) => `${seed}${s}`)))).slice(0, 250);
const CITY_LIST = ['İstanbul','Ankara','İzmir','Bursa','Antalya','Eskişehir','Muğla','Mersin','Adana','Konya','Samsun','Trabzon','Gaziantep','Kayseri','Kocaeli','Tekirdağ','Çanakkale','Aydın','Balıkesir','Denizli','Sakarya','Hatay','Manisa','Edirne','Bolu','Kırklareli','Sinop','Rize','Giresun','Ordu'];
const QUICK_REPLIES = ['Merhaba! 🌸', 'Naber, günün nasıl geçti?', 'Fotoğrafın çok güzel 😍', 'Kahve içelim mi? ☕'];
const THREAD_TAGS = ['sicak_lead', 'soguk', 'takip_edilecek'];
const BULK_TEMPLATES = ['Merhaba! 👋', 'Naber, günün nasıl?', 'Müsaitsen yaz ✨'];

function hashToInt(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) % 2147483647;
  }
  return Math.abs(hash);
}

function buildHourlyOnlineMap(profiles, hourKey) {
  const map = {};
  const list = profiles || [];
  if (!list.length) return map;

  const targetOnlineCount = Math.min(list.length, Math.floor(list.length / 2) + 3);
  const ranked = [...list]
    .map((profile) => ({
      id: profile.id,
      score: hashToInt(`${hourKey}-${profile.id}`),
    }))
    .sort((a, b) => a.score - b.score);

  ranked.forEach((item, index) => {
    map[item.id] = index < targetOnlineCount;
  });

  return map;
}

export default function App() {
  const [status, setStatus] = useState('');

  const {
    mode,
    setMode,
    authForm,
    setAuthForm,
    loading,
    memberSession,
    isAdmin,
    signIn,
    signUp,
    signOut,
  } = useAuth({ adminPasswords: [ADMIN_PASSWORD, ADMIN_PASSWORD2], setStatus });

  const [virtualProfiles, setVirtualProfiles] = useState([]);
  const [selectedProfileId, setSelectedProfileId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');

  const [profileForm, setProfileForm] = useState(initialProfile);
  const [incomingThreads, setIncomingThreads] = useState([]);
  const [selectedThread, setSelectedThread] = useState(null);
  const [adminReply, setAdminReply] = useState('');
  const [threadMessages, setThreadMessages] = useState([]);
  const [memberProfile, setMemberProfile] = useState(initialMemberProfile);
  const [onboardingActionCount, setOnboardingActionCount] = useState(0);
  const [unreadByProfile, setUnreadByProfile] = useState({});
  const [adminUnreadByThread, setAdminUnreadByThread] = useState({});
  const [onlineProfiles, setOnlineProfiles] = useState({});
  const [typingLabel, setTypingLabel] = useState('');
  const [adminTypingByThread, setAdminTypingByThread] = useState({});
  const [aiSuggestions, setAiSuggestions] = useState([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [adminDrawerOpen, setAdminDrawerOpen] = useState(true);
  const [selectedThreadKeys, setSelectedThreadKeys] = useState({});
  const [bulkTemplate, setBulkTemplate] = useState(BULK_TEMPLATES[0]);
  const [notificationSoundEnabled, setNotificationSoundEnabled] = useState(true);
  const [engagementInsights, setEngagementInsights] = useState({ topHours: [], topProfiles: [] });
  const [adminStats, setAdminStats] = useState({
    totalMessagesToday: 0,
    memberMessagesToday: 0,
    adminRepliesToday: 0,
    respondedThreadsToday: 0,
    newMembersToday: 0,
    activeThreadsToday: 0,
    avgResponseMinToday: 0,
  });
  const [statsRange, setStatsRange] = useState('daily');
  const [adminTab, setAdminTab] = useState('chat');
  const [quickFactsText, setQuickFactsText] = useState('');
  const [cityFilter, setCityFilter] = useState('');
  const [genderFilter, setGenderFilter] = useState('all');
  const [profileSearch, setProfileSearch] = useState('');
  const [discoverSort, setDiscoverSort] = useState('match');
  const [likedProfiles, setLikedProfiles] = useState({});
  const [heartedProfiles, setHeartedProfiles] = useState({});
  const [wavedProfiles, setWavedProfiles] = useState({});
  const [userView, setUserView] = useState('discover');
  const [registeredMembers, setRegisteredMembers] = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [selectedMemberProfile, setSelectedMemberProfile] = useState(null);
  const [memberModeration, setMemberModeration] = useState({ note: '', tags: '', blacklisted: false });
  const [coinPurchaseModalOpen, setCoinPurchaseModalOpen] = useState(false);
  const [zeroCoinPromptDismissed, setZeroCoinPromptDismissed] = useState(false);
  const [coinCheckoutLoading, setCoinCheckoutLoading] = useState(false);
  const [paymentSettings, setPaymentSettings] = useState({
    provider: '',
    webhook_url: DEFAULT_CHECKOUT_ENDPOINT,
    is_active: false,
  });
  const [hourKey, setHourKey] = useState(() => new Date().toISOString().slice(0, 13));
  const chatBoxRef = useRef(null);
  const adminChatBoxRef = useRef(null);
  const profileListRef = useRef(null);
  const threadQueueRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  const selectedProfile = useMemo(
    () => virtualProfiles.find((p) => p.id === selectedProfileId) || null,
    [selectedProfileId, virtualProfiles]
  );

  const sortedProfiles = useMemo(() => {
    return [...virtualProfiles].sort((a, b) => {
      const unreadA = unreadByProfile[a.id] || 0;
      const unreadB = unreadByProfile[b.id] || 0;
      if (unreadA !== unreadB) return unreadB - unreadA;
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });
  }, [virtualProfiles, unreadByProfile]);

  const loggedIn = !!memberSession || isAdmin;

  const profileById = useMemo(() => Object.fromEntries(virtualProfiles.map((p) => [p.id, p])), [virtualProfiles]);
  const selectedThreadProfile = useMemo(() => (selectedThread ? profileById[selectedThread.virtual_profile_id] : null), [selectedThread, profileById]);
  const sortedIncomingThreads = useMemo(() => {
    return [...incomingThreads].sort((a, b) => {
      const waitA = a.last_sender_role === 'member' ? 1 : 0;
      const waitB = b.last_sender_role === 'member' ? 1 : 0;
      if (waitA !== waitB) return waitB - waitA;
      return new Date(b.last_message_at || 0) - new Date(a.last_message_at || 0);
    });
  }, [incomingThreads]);

  const slaStats = useMemo(() => {
    const waiting = incomingThreads.filter((t) => t.last_sender_role === 'member' || (adminUnreadByThread[threadKey(t.member_id, t.virtual_profile_id)] || 0) > 0);
    const now = Date.now();
    const avgWaitMin = waiting.length
      ? waiting.reduce((acc, t) => {
        const ts = t.last_message_at || t.created_at;
        const diff = ts ? (now - new Date(ts).getTime()) / 60000 : 0;
        return acc + Math.max(diff, 0);
      }, 0) / waiting.length
      : 0;
    return {
      waitingCount: waiting.length,
      avgWaitMin,
      lastReplyMin: selectedThread?.last_message_at ? (now - new Date(selectedThread.last_message_at).getTime()) / 60000 : 0,
    };
  }, [incomingThreads, selectedThread, adminUnreadByThread]);

  const interestScore = useMemo(() => {
    if (!selectedProfileId) return 0;
    const weekKey = (() => {
      const now = new Date();
      const start = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
      const dayOfYear = Math.floor((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - start.getTime()) / 86400000) + 1;
      return `${now.getUTCFullYear()}-W${Math.ceil(dayOfYear / 7)}`;
    })();
    const seed = `${weekKey}-${memberSession?.id || 'guest'}-${selectedProfileId}`;
    const score = 70 + (hashToInt(seed) % 31); // 70-100
    return Math.min(100, Math.max(70, score));
  }, [selectedProfileId, memberSession?.id]);

  useEffect(() => {
    if (!loggedIn || isAdmin) return;
    const tick = () => {
      const nowHour = new Date().toISOString().slice(0, 13);
      setHourKey((prev) => (prev === nowHour ? prev : nowHour));
    };
    const interval = window.setInterval(tick, 60 * 1000);
    return () => window.clearInterval(interval);
  }, [loggedIn, isAdmin]);

  useEffect(() => {
    if (!loggedIn || isAdmin) return;
    const balance = Number(memberProfile.coin_balance ?? 0);
    if (balance <= 0 && !zeroCoinPromptDismissed) {
      setCoinPurchaseModalOpen(true);
      return;
    }
    if (balance > 0 && zeroCoinPromptDismissed) {
      setZeroCoinPromptDismissed(false);
    }
  }, [loggedIn, isAdmin, memberProfile.coin_balance, zeroCoinPromptDismissed]);

  const effectiveOnlineProfiles = useMemo(
    () => (isAdmin ? onlineProfiles : buildHourlyOnlineMap(virtualProfiles, hourKey)),
    [isAdmin, onlineProfiles, virtualProfiles, hourKey]
  );

  const discoverProfiles = useMemo(() => {
    const filtered = sortedProfiles.filter((profile) => {
      const cityOk = cityFilter ? (profile.city || '').toLowerCase().includes(cityFilter.toLowerCase()) : true;
      const genderOk = genderFilter === 'all' ? true : (profile.gender || '').toLowerCase() === genderFilter.toLowerCase();
      const text = `${profile.name || ''} ${profile.city || ''} ${profile.hobbies || ''}`.toLowerCase();
      const searchOk = profileSearch ? text.includes(profileSearch.toLowerCase()) : true;
      return cityOk && genderOk && searchOk;
    });
    const score = (profile) => {
      const a = new Set((profile.hobbies || '').toLowerCase().split(',').map((x) => x.trim()).filter(Boolean));
      const b = new Set((memberProfile.hobbies || '').toLowerCase().split(',').map((x) => x.trim()).filter(Boolean));
      if (!a.size || !b.size) return 0;
      let common = 0;
      a.forEach((item) => { if (b.has(item)) common += 1; });
      return Math.round((common / Math.max(a.size, b.size)) * 100);
    };

    return filtered.sort((p1, p2) => {
      if (discoverSort === 'newest') return new Date(p2.created_at || 0) - new Date(p1.created_at || 0);
      if (discoverSort === 'age_asc') return Number(p1.age || 0) - Number(p2.age || 0);
      if (discoverSort === 'online') return Number(!!effectiveOnlineProfiles[p2.id]) - Number(!!effectiveOnlineProfiles[p1.id]);
      return score(p2) - score(p1);
    });
  }, [sortedProfiles, cityFilter, genderFilter, profileSearch, memberProfile.hobbies, discoverSort, effectiveOnlineProfiles]);

  const totalUnreadCount = useMemo(
    () => Object.values(unreadByProfile).reduce((sum, count) => sum + Number(count || 0), 0),
    [unreadByProfile]
  );

  const activeProfileCount = useMemo(
    () => virtualProfiles.filter((profile) => effectiveOnlineProfiles[profile.id]).length,
    [virtualProfiles, effectiveOnlineProfiles]
  );

  const spotlightProfiles = useMemo(() => discoverProfiles.slice(0, 5), [discoverProfiles]);

  const onboardingState = useMemo(() => {
    const hasPhoto = !!memberProfile.photo_url;
    const hasHobbies = (memberProfile.hobbies || '').split(',').map((x) => x.trim()).filter(Boolean).length > 0;
    const hasThreeActions = onboardingActionCount >= 3;
    const completed = hasPhoto && hasHobbies && hasThreeActions;
    const currentStep = !hasPhoto ? 1 : !hasHobbies ? 2 : !hasThreeActions ? 3 : 0;
    return { hasPhoto, hasHobbies, hasThreeActions, completed, currentStep };
  }, [memberProfile.photo_url, memberProfile.hobbies, onboardingActionCount]);

  function threadKey(memberId, profileId) {
    return `${memberId}::${profileId}`;
  }

  async function selectRows(table, buildQuery) {
    const query = buildQuery(supabase.from(table).select('*'));
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  async function insertRows(table, payload) {
    const { data, error } = await supabase.from(table).insert(payload).select();
    if (error) throw error;
    return data || [];
  }

  async function updateRows(table, payload, buildQuery) {
    const query = buildQuery(supabase.from(table).update(payload));
    const { data, error } = await query.select();
    if (error) throw error;
    return data || [];
  }

  function formatTime(ts) {
    if (!ts) return '';
    return new Date(ts).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  }

  function getRandomItem(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function buildRandomVirtualProfile() {
    return {
      name: getRandomItem(FEMALE_NAMES),
      age: String(Math.floor(Math.random() * 14) + 20),
      city: getRandomItem(CITY_LIST),
      gender: 'Kadın',
      hobbies: getRandomItem(['Kahve, seyahat, müzik','Yoga, kitap, yürüyüş','Sinema, fotoğraf, dans','Pilates, moda, sanat','Doğa, kamp, paten']),
    };
  }

  function fillRandomVirtualProfile() {
    setProfileForm((prev) => ({ ...prev, ...buildRandomVirtualProfile() }));
  }

  function playNotificationSound() {
    if (!notificationSoundEnabled) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.setValueAtTime(0.001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);

      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start();
      oscillator.stop(ctx.currentTime + 0.25);
    } catch {
      // Sessizce geç
    }
  }

  useEffect(() => {
    const saved = window.localStorage.getItem('admin_notification_sound_enabled');
    if (saved === null) return;
    setNotificationSoundEnabled(saved === 'true');
  }, []);

  useEffect(() => {
    window.localStorage.setItem('admin_notification_sound_enabled', String(notificationSoundEnabled));
  }, [notificationSoundEnabled]);

  function getAudioUrl(content) {
    const clean = (content || '').trim();
    if (!clean) return null;
    if (clean.startsWith('audio:')) return clean.replace('audio:', '').trim();
    if (/^https?:\/\/.+\.(mp3|wav|m4a|ogg)(\?.*)?$/i.test(clean)) return clean;
    return null;
  }

  function autoResizeTextarea(el, maxHeight = 220) {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  }

  useEffect(() => {
    if (!loggedIn) return;
    fetchVirtualProfiles();
    if (!isAdmin) fetchUnreadCounts();
    if (isAdmin) fetchIncomingThreads();
  }, [loggedIn, isAdmin, memberSession]);

  useEffect(() => {
    if (!memberSession || !selectedProfileId || isAdmin || userView !== 'chat') return;
    fetchMessages(selectedProfileId);
  }, [memberSession, selectedProfileId, isAdmin, userView]);

  useEffect(() => {
    if (!selectedProfileId || isAdmin || userView !== 'chat') return;
    setUnreadByProfile((prev) => ({ ...prev, [selectedProfileId]: 0 }));
  }, [selectedProfileId, isAdmin, userView]);

  useEffect(() => {
    if (!isAdmin || !selectedThread) return;
    const key = threadKey(selectedThread.member_id, selectedThread.virtual_profile_id);
    setAdminUnreadByThread((prev) => ({ ...prev, [key]: 0 }));
  }, [isAdmin, selectedThread]);

  useEffect(() => {
    if (!memberSession || isAdmin) return;
    if (!chatBoxRef.current) return;
    chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight;
  }, [messages, memberSession, isAdmin]);

  useEffect(() => {
    if (!isAdmin || !adminChatBoxRef.current) return;
    adminChatBoxRef.current.scrollTop = adminChatBoxRef.current.scrollHeight;
  }, [threadMessages, isAdmin]);

  useEffect(() => {
    if (!profileListRef.current) return;
    profileListRef.current.scrollTop = 0;
  }, [unreadByProfile]);

  useEffect(() => {
    if (!threadQueueRef.current || !isAdmin) return;
    threadQueueRef.current.scrollTop = 0;
  }, [incomingThreads, isAdmin]);

  useEffect(() => {
    if (!isAdmin || selectedThread || !sortedIncomingThreads.length) return;
    setSelectedThread(sortedIncomingThreads[0]);
  }, [isAdmin, selectedThread, sortedIncomingThreads]);

  useEffect(() => {
    if (!isAdmin || !selectedThread) return;
    fetchThreadMessages(selectedThread.member_id, selectedThread.virtual_profile_id);
    fetchQuickFacts(selectedThread.member_id, selectedThread.virtual_profile_id);
    fetchMemberProfile(selectedThread.member_id);
    fetchMemberModeration(selectedThread.member_id);
  }, [isAdmin, selectedThread]);

  useEffect(() => {
    if (!isAdmin) return;
    fetchEngagementInsights();
  }, [isAdmin, incomingThreads, virtualProfiles]);

  useEffect(() => {
    if (!isAdmin || adminTab !== 'stats') return;
    fetchAdminStats();
  }, [isAdmin, adminTab, incomingThreads, threadMessages, statsRange]);

  useEffect(() => {
    if (!isAdmin || adminTab !== 'settings') return;
    fetchRegisteredMembers();
  }, [isAdmin, adminTab]);

  useEffect(() => {
    if (!isAdmin || adminTab !== 'payments') return;
    fetchPaymentSettings();
  }, [isAdmin, adminTab]);

  useEffect(() => {
    if (!memberSession || isAdmin || userView !== 'coins') return;
    fetchPublicPaymentSettings();
  }, [memberSession, isAdmin, userView]);

  useEffect(() => {
    if (!memberSession || isAdmin) return;
    fetchOwnProfile();
  }, [memberSession, isAdmin]);

  useEffect(() => {
    if (!memberSession || isAdmin) return;
    fetchOnboardingActionCount();
  }, [memberSession, isAdmin]);

  useEffect(() => {
    if (!memberSession || isAdmin) return;
    setUserView('discover');
  }, [memberSession, isAdmin]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (!isAdmin) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandPaletteOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isAdmin]);

  useEffect(() => {
    if (!loggedIn) return;

    const channel = supabase
      .channel('messages-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, (payload) => {
        if (isAdmin) {
          fetchIncomingThreads();
          const changed = payload.new || payload.old;
          if (!changed) return;

          const key = threadKey(changed.member_id, changed.virtual_profile_id);
          const selectedKey = selectedThread
            ? threadKey(selectedThread.member_id, selectedThread.virtual_profile_id)
            : null;

          if (selectedKey && key === selectedKey) {
            fetchThreadMessages(changed.member_id, changed.virtual_profile_id);
            setAdminUnreadByThread((prev) => ({ ...prev, [key]: 0 }));
          } else if (changed.sender_role === 'member') {
            setAdminUnreadByThread((prev) => ({ ...prev, [key]: (prev[key] || 0) + 1 }));
            playNotificationSound();
          }
          return;
        }

        if (!memberSession) return;
        const changed = payload.new || payload.old;
        if (!changed) return;

        if (changed.member_id !== memberSession.id) return;

        if (changed.sender_role === 'virtual') {
          playNotificationSound();
        }

        const viewingSelectedChat = userView === 'chat' && selectedProfileId && changed.virtual_profile_id === selectedProfileId;

        if (viewingSelectedChat) {
          fetchMessages(selectedProfileId);
          if (changed.sender_role === 'virtual') {
            setUnreadByProfile((prev) => ({ ...prev, [selectedProfileId]: 0 }));
          }
        } else if (changed.sender_role === 'virtual') {
          setUnreadByProfile((prev) => ({
            ...prev,
            [changed.virtual_profile_id]: (prev[changed.virtual_profile_id] || 0) + 1,
          }));
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loggedIn, isAdmin, memberSession, selectedProfileId, selectedThread, userView]);

  useEffect(() => {
    if (!loggedIn) return;

    const presenceChannel = supabase.channel('virtual-profiles-presence', {
      config: { presence: { key: isAdmin ? `admin-${Date.now()}` : `member-${memberSession?.id || Date.now()}` } },
    });

    presenceChannel
      .on('presence', { event: 'sync' }, () => {
        const state = presenceChannel.presenceState();
        const online = {};
        Object.values(state).forEach((entries) => {
          entries.forEach((entry) => {
            (entry.online_profiles || []).forEach((profileId) => {
              online[profileId] = true;
            });
          });
        });
        setOnlineProfiles(online);
      })
      .subscribe(async (state) => {
        if (state === 'SUBSCRIBED' && isAdmin) {
          await presenceChannel.track({
            role: 'admin',
            online_profiles: virtualProfiles.map((p) => p.id),
          });
        }
      });

    return () => {
      supabase.removeChannel(presenceChannel);
    };
  }, [loggedIn, isAdmin, memberSession?.id, virtualProfiles]);

  useEffect(() => {
    if (!loggedIn) return;

    const typingChannel = supabase.channel('typing-indicators', {
      config: { presence: { key: isAdmin ? `typing-admin-${Date.now()}` : `typing-member-${memberSession?.id || Date.now()}` } },
    });

    typingChannel
      .on('presence', { event: 'sync' }, () => {
        const state = typingChannel.presenceState();
        let memberTyping = '';
        const adminTypingMap = {};

        Object.values(state).forEach((entries) => {
          entries.forEach((entry) => {
            if (entry.role === 'admin' && entry.typing && memberSession?.id === entry.member_id && selectedProfileId === entry.virtual_profile_id) {
              memberTyping = `${entry.display_name || 'Admin'} yazıyor...`;
            }

            if (entry.role === 'member' && entry.typing) {
              const key = threadKey(entry.member_id, entry.virtual_profile_id);
              adminTypingMap[key] = true;
            }
          });
        });

        setTypingLabel(memberTyping);
        setAdminTypingByThread(adminTypingMap);
      })
      .subscribe(async (state) => {
        if (state === 'SUBSCRIBED') {
          await typingChannel.track({ role: isAdmin ? 'admin' : 'member', typing: false });
        }
      });

    const stopTyping = () => {
      typingChannel.track({
        role: isAdmin ? 'admin' : 'member',
        typing: false,
        member_id: isAdmin ? selectedThread?.member_id : memberSession?.id,
        virtual_profile_id: isAdmin ? selectedThread?.virtual_profile_id : selectedProfileId,
        display_name: isAdmin ? (selectedThread?.virtual_name || 'Admin') : (memberSession?.username || 'Üye'),
      });
    };

    const typingText = isAdmin ? adminReply : newMessage;
    const memberId = isAdmin ? selectedThread?.member_id : memberSession?.id;
    const profileId = isAdmin ? selectedThread?.virtual_profile_id : selectedProfileId;

    if (memberId && profileId && typingText.trim()) {
      typingChannel.track({
        role: isAdmin ? 'admin' : 'member',
        typing: true,
        member_id: memberId,
        virtual_profile_id: profileId,
        display_name: isAdmin ? (selectedThread?.virtual_name || 'Admin') : (memberSession?.username || 'Üye'),
      });

      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(stopTyping, 1300);
    } else {
      stopTyping();
    }

    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      supabase.removeChannel(typingChannel);
    };
  }, [loggedIn, isAdmin, newMessage, adminReply, selectedProfileId, selectedThread, memberSession]);

  async function uploadImage(file, folder) {
    if (!file) return null;
    const ext = file.name.split('.').pop() || 'jpg';
    const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const { error: uploadError } = await supabase.storage.from('profile-images').upload(path, file, { upsert: true });
    if (uploadError) {
      setStatus(`Görsel yükleme hatası: ${uploadError.message}`);
      return null;
    }

    const { data } = supabase.storage.from('profile-images').getPublicUrl(path);
    return data?.publicUrl || null;
  }

  async function fetchOwnProfile() {
    const { data, error } = await supabase
      .from('member_profiles')
      .select('*')
      .eq('member_id', memberSession.id)
      .maybeSingle();

    if (error) return setStatus(error.message);
    if (!data) {
      await supabase
        .from('member_profiles')
        .upsert({ member_id: memberSession.id, coin_balance: 100, status_emoji: '🙂' }, { onConflict: 'member_id' });
      return setMemberProfile(initialMemberProfile);
    }

    setMemberProfile({
      age: data.age || '',
      hobbies: data.hobbies || '',
      city: data.city || '',
      photo_url: data.photo_url || '',
      status_emoji: data.status_emoji || '🙂',
      coin_balance: Number(data.coin_balance ?? 100),
      contact_phone: data.contact_phone || '',
    });
  }

  async function fetchOnboardingActionCount() {
    if (!memberSession) return;
    const { data, error } = await supabase
      .from('engagement_events')
      .select('id')
      .eq('member_id', memberSession.id)
      .eq('event_type', 'member_message')
      .limit(50);

    if (error) return setStatus(error.message);
    setOnboardingActionCount(Math.min((data || []).length, 50));
  }

  async function saveOwnProfile() {
    if (!memberSession) return;

    const payload = {
      member_id: memberSession.id,
      age: memberProfile.age ? Number(memberProfile.age) : null,
      hobbies: memberProfile.hobbies,
      city: memberProfile.city,
      photo_url: memberProfile.photo_url,
      status_emoji: memberProfile.status_emoji,
      coin_balance: Number(memberProfile.coin_balance ?? 100),
      contact_phone: memberProfile.contact_phone || null,
    };

    const { error } = await supabase
      .from('member_profiles')
      .upsert(payload, { onConflict: 'member_id' });

    if (error) return setStatus(error.message);
    setStatus('Profil bilgilerin kaydedildi.');
  }

  async function consumeCoins(amount) {
    if (!memberSession || isAdmin) return true;
    const current = Number(memberProfile.coin_balance || 0);
    if (current < amount) return false;

    const nextBalance = current - amount;
    const { error } = await supabase
      .from('member_profiles')
      .update({ coin_balance: nextBalance })
      .eq('member_id', memberSession.id);

    if (error) {
      setStatus(error.message);
      return false;
    }

    setMemberProfile((prev) => ({ ...prev, coin_balance: nextBalance }));
    return true;
  }

  async function handleCoinPurchaseTest() {
    if (!memberSession) return;
    if ((memberProfile.contact_phone || '').trim() !== TEST_CONTACT_NUMBER) {
      return setStatus(`Test için iletişim numarasını ${TEST_CONTACT_NUMBER} girmen gerekiyor.`);
    }

    const nextBalance = Number(memberProfile.coin_balance || 0) + 5000;
    const { error } = await supabase
      .from('member_profiles')
      .upsert({
        member_id: memberSession.id,
        coin_balance: nextBalance,
        contact_phone: memberProfile.contact_phone,
      }, { onConflict: 'member_id' });

    if (error) return setStatus(error.message);
    setMemberProfile((prev) => ({ ...prev, coin_balance: nextBalance }));
    setStatus('Test satın alma başarılı: 5000 jeton yüklendi.');
  }

  function handleSignOut() {
    signOut(() => {
      setSelectedProfileId(null);
      setMessages([]);
      setIncomingThreads([]);
      setSelectedThread(null);
      setUnreadByProfile({});
      setAdminUnreadByThread({});
      setTypingLabel('');
      setUserView('discover');
    });
  }

  async function fetchVirtualProfiles() {
    try {
      const data = await selectRows('virtual_profiles', (q) => q.order('created_at', { ascending: true }));
      setVirtualProfiles(data || []);
      if (!selectedProfileId && data?.length) setSelectedProfileId(data[0].id);
    } catch (error) {
      setStatus(error.message);
    }
  }

  async function fetchUnreadCounts() {
    if (!memberSession || isAdmin) return;
    const { data, error } = await supabase
      .from('messages')
      .select('virtual_profile_id')
      .eq('member_id', memberSession.id)
      .eq('sender_role', 'virtual')
      .eq('seen_by_member', false);

    if (error) return setStatus(error.message);

    const counts = (data || []).reduce((acc, row) => {
      const key = row.virtual_profile_id;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    setUnreadByProfile(counts);
  }

  async function fetchMessages(profileId) {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('virtual_profile_id', profileId)
      .eq('member_id', memberSession.id)
      .order('created_at', { ascending: true });

    if (error) return setStatus(error.message);
    setMessages(data || []);

    await supabase
      .from('messages')
      .update({ seen_by_member: true, seen_by_member_at: new Date().toISOString() })
      .eq('virtual_profile_id', profileId)
      .eq('member_id', memberSession.id)
      .eq('sender_role', 'virtual')
      .eq('seen_by_member', false);

    setUnreadByProfile((prev) => ({ ...prev, [profileId]: 0 }));
  }

  async function sendMessage() {
    if (!memberSession || !selectedProfileId || !newMessage.trim()) return;
    const hasCoin = await consumeCoins(COIN_COST_PER_MESSAGE);
    if (!hasCoin) {
      setCoinPurchaseModalOpen(true);
      return setStatus(`Yetersiz jeton. Bir mesaj için ${COIN_COST_PER_MESSAGE} jeton gerekir.`);
    }

    const { data: memberExists } = await supabase
      .from('members')
      .select('id')
      .eq('id', memberSession.id)
      .maybeSingle();

    if (!memberExists) {
      return setStatus('Oturum üyeliği veritabanında bulunamadı. Lütfen çıkış yapıp tekrar giriş yap.');
    }

    const slashCommands = {
      '/selam': 'Selam 👋',
      '/kahve': 'Kahve içelim mi? ☕',
    };
    const normalizedMessage = slashCommands[newMessage.trim().toLowerCase()] || newMessage.trim();

    const { error } = await supabase.from('messages').insert({
      member_id: memberSession.id,
      virtual_profile_id: selectedProfileId,
      sender_role: 'member',
      content: normalizedMessage,
      seen_by_member: true,
      seen_by_admin: false,
    });
    if (error) return setStatus(error.message);
    recordEngagement('member_message', memberSession.id, selectedProfileId, { source: 'chat_input' });
    setOnboardingActionCount((prev) => prev + 1);
    setNewMessage('');
    fetchMessages(selectedProfileId);
  }

  async function sendReaction(profileId, reactionType) {
    if (!memberSession || !profileId) return;
    const hasCoin = await consumeCoins(COIN_COST_PER_MESSAGE);
    if (!hasCoin) {
      setCoinPurchaseModalOpen(true);
      return setStatus(`Yetersiz jeton. Etkileşim için ${COIN_COST_PER_MESSAGE} jeton gerekir.`);
    }
    const templates = {
      heart: '💘 Kalp gönderdim.',
      wave: '👋 Selam, sana el salladım.',
      like: '👍 Profilini beğendim.',
    };
    const content = templates[reactionType];
    if (!content) return;

    const { error } = await supabase.from('messages').insert({
      member_id: memberSession.id,
      virtual_profile_id: profileId,
      sender_role: 'member',
      content,
      seen_by_member: true,
      seen_by_admin: false,
    });
    if (error) return setStatus(error.message);
    recordEngagement('member_message', memberSession.id, profileId, { source: `reaction_${reactionType}` });
    setOnboardingActionCount((prev) => prev + 1);
    setStatus('Etkileşim mesajı gönderildi.');
  }

  async function createVirtualProfile() {
    const auto = buildRandomVirtualProfile();
    const payload = {
      name: profileForm.name || auto.name,
      age: Number(profileForm.age || auto.age),
      city: profileForm.city || auto.city,
      gender: profileForm.gender || 'Kadın',
      hobbies: profileForm.hobbies || auto.hobbies,
      photo_url: profileForm.photo_url,
    };

    if (!payload.photo_url) return setStatus('Fotoğraf yükleyip Kaydet tuşuna bas. İsim/şehir/yaş otomatik üretilecek.');

    let { error } = await supabase.from('virtual_profiles').insert(payload);

    if (error?.message?.includes("Could not find the 'photo_url' column")) {
      const retry = await supabase.from('virtual_profiles').insert({
        name: payload.name,
        age: payload.age,
        city: payload.city,
        gender: payload.gender,
        hobbies: payload.hobbies,
      });
      error = retry.error;
      if (!error) {
        setStatus("Profil kaydedildi. Fotoğraf kolonu henüz migration almadığı için görsel eklenmedi. SQL migration'ı tekrar çalıştır.");
      }
    }

    if (error) return setStatus(error.message);
    setProfileForm(initialProfile);
    fetchVirtualProfiles();
    fetchIncomingThreads();
    setStatus(`Sanal profil oluşturuldu: ${payload.name}, ${payload.city}`);
  }

  async function fetchIncomingThreads() {
    try {
      const data = await selectRows('admin_threads', (q) => q.order('last_message_at', { ascending: false }));
      setIncomingThreads(data || []);
    } catch (error) {
      setStatus(error.message);
    }
  }

  async function recordEngagement(eventType, memberId, virtualProfileId, meta = {}) {
    try {
      await supabase.from('engagement_events').insert({
        event_type: eventType,
        member_id: memberId,
        virtual_profile_id: virtualProfileId,
        meta,
      });
    } catch {
      // tablo kurulmamışsa akışı bozma
    }
  }

  async function fetchEngagementInsights() {
    if (!isAdmin) return;
    const since = new Date(Date.now() - 1000 * 60 * 60 * 24 * 7).toISOString();
    let rows = [];

    const events = await supabase
      .from('engagement_events')
      .select('created_at, virtual_profile_id, event_type')
      .eq('event_type', 'member_message')
      .gte('created_at', since);

    if (!events.error && events.data?.length) {
      rows = events.data;
    } else {
      const fallback = await supabase
        .from('messages')
        .select('created_at, virtual_profile_id, sender_role')
        .eq('sender_role', 'member')
        .gte('created_at', since);
      rows = (fallback.data || []).map((r) => ({ ...r, event_type: 'member_message' }));
    }

    const hourMap = new Map();
    const profileMap = new Map();
    rows.forEach((row) => {
      const d = new Date(row.created_at);
      const h = Number.isNaN(d.getTime()) ? 0 : d.getHours();
      hourMap.set(h, (hourMap.get(h) || 0) + 1);
      profileMap.set(row.virtual_profile_id, (profileMap.get(row.virtual_profile_id) || 0) + 1);
    });

    const topHours = [...hourMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([hour, count]) => ({ label: `${String(hour).padStart(2, '0')}:00`, count }));

    const topProfiles = [...profileMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([profileId, count]) => ({
        name: profileById[profileId]?.name || 'Bilinmeyen Profil',
        count,
      }));

    setEngagementInsights({ topHours, topProfiles });
  }

  async function fetchAdminStats() {
    if (!isAdmin) return;
    const start = new Date();
    if (statsRange === 'daily') {
      start.setHours(0, 0, 0, 0);
    } else if (statsRange === 'weekly') {
      start.setDate(start.getDate() - 7);
    } else {
      start.setMonth(start.getMonth() - 1);
    }
    const startIso = start.toISOString();

    const [{ data: todayMessages, error: msgErr }, { data: todayMembers, error: memberErr }] = await Promise.all([
      supabase
        .from('messages')
        .select('member_id, virtual_profile_id, sender_role, created_at')
        .gte('created_at', startIso),
      supabase
        .from('members')
        .select('id, created_at')
        .gte('created_at', startIso),
    ]);

    if (msgErr || memberErr) {
      setStatus(msgErr?.message || memberErr?.message || 'Stats alınamadı.');
      return;
    }

    const messages = todayMessages || [];
    const memberMessages = messages.filter((m) => m.sender_role === 'member');
    const adminReplies = messages.filter((m) => m.sender_role === 'virtual');

    const activeThreadKeys = new Set(messages.map((m) => `${m.member_id}::${m.virtual_profile_id}`));
    const respondedThreadKeys = new Set();
    const responseMinutes = [];

    const grouped = new Map();
    messages.forEach((m) => {
      const key = `${m.member_id}::${m.virtual_profile_id}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(m);
    });

    grouped.forEach((rows, key) => {
      rows.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      let lastMemberTs = null;
      rows.forEach((row) => {
        if (row.sender_role === 'member') {
          lastMemberTs = row.created_at;
        } else if (row.sender_role === 'virtual' && lastMemberTs) {
          respondedThreadKeys.add(key);
          const diffMin = (new Date(row.created_at).getTime() - new Date(lastMemberTs).getTime()) / 60000;
          if (diffMin >= 0) responseMinutes.push(diffMin);
          lastMemberTs = null;
        }
      });
    });

    const avgResponseMinToday = responseMinutes.length
      ? responseMinutes.reduce((a, b) => a + b, 0) / responseMinutes.length
      : 0;

    setAdminStats({
      totalMessagesToday: messages.length,
      memberMessagesToday: memberMessages.length,
      adminRepliesToday: adminReplies.length,
      respondedThreadsToday: respondedThreadKeys.size,
      newMembersToday: (todayMembers || []).length,
      activeThreadsToday: activeThreadKeys.size,
      avgResponseMinToday,
    });
  }

  async function fetchThreadMessages(memberId, profileId) {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('member_id', memberId)
      .eq('virtual_profile_id', profileId)
      .order('created_at', { ascending: true });

    if (error) return setStatus(error.message);
    setThreadMessages(data || []);

    await supabase
      .from('messages')
      .update({ seen_by_admin: true, seen_by_admin_at: new Date().toISOString() })
      .eq('member_id', memberId)
      .eq('virtual_profile_id', profileId)
      .eq('sender_role', 'member')
      .eq('seen_by_admin', false);
  }

  async function fetchQuickFacts(memberId, profileId) {
    const { data, error } = await supabase
      .from('thread_quick_facts')
      .select('notes')
      .eq('member_id', memberId)
      .eq('virtual_profile_id', profileId)
      .maybeSingle();
    if (error) return;
    setQuickFactsText(data?.notes || '');
  }

  async function fetchMemberProfile(memberId) {
    const { data, error } = await supabase
      .from('member_profiles')
      .select('age, hobbies, city, photo_url, status_emoji')
      .eq('member_id', memberId)
      .maybeSingle();
    if (error) return setSelectedMemberProfile(null);
    setSelectedMemberProfile(data || null);
  }

  async function fetchMemberModeration(memberId) {
    const { data, error } = await supabase
      .from('member_moderation')
      .select('notes, tags, is_blacklisted')
      .eq('member_id', memberId)
      .maybeSingle();

    if (error) return setMemberModeration({ note: '', tags: '', blacklisted: false });
    setMemberModeration({
      note: data?.notes || '',
      tags: (data?.tags || []).join(', '),
      blacklisted: !!data?.is_blacklisted,
    });
  }

  async function saveMemberModeration() {
    if (!selectedThread) return;
    const payload = {
      member_id: selectedThread.member_id,
      notes: memberModeration.note,
      tags: memberModeration.tags
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean),
      is_blacklisted: !!memberModeration.blacklisted,
    };

    const { error } = await supabase
      .from('member_moderation')
      .upsert(payload, { onConflict: 'member_id' });

    if (error) return setStatus(error.message);
    setStatus('Moderasyon ayarları kaydedildi.');
  }

  async function fetchPaymentSettings() {
    const { data, error } = await supabase
      .from('payment_gateway_settings')
      .select('provider, webhook_url, is_active')
      .eq('id', 1)
      .maybeSingle();

    if (error) return setStatus(error.message);
    if (!data) return;
    setPaymentSettings({
      provider: data.provider || '',
      webhook_url: data.webhook_url || DEFAULT_CHECKOUT_ENDPOINT,
      is_active: !!data.is_active,
    });
  }

  async function fetchPublicPaymentSettings() {
    const { data, error } = await supabase
      .from('payment_gateway_settings')
      .select('provider, webhook_url, is_active')
      .eq('id', 1)
      .maybeSingle();

    if (error) return setStatus(error.message);
    if (!data) return;
    setPaymentSettings((prev) => ({
      ...prev,
      provider: data.provider || '',
      webhook_url: data.webhook_url || DEFAULT_CHECKOUT_ENDPOINT,
      is_active: !!data.is_active,
    }));
  }

  async function savePaymentSettings() {
    const { error } = await supabase
      .from('payment_gateway_settings')
      .upsert({
        id: 1,
        provider: paymentSettings.provider,
        webhook_url: DEFAULT_CHECKOUT_ENDPOINT,
        is_active: paymentSettings.is_active,
      }, { onConflict: 'id' });

    if (error) return setStatus(error.message);
    setStatus('Ödeme API ayarları kaydedildi.');
  }

  async function requestCoinCheckout(coinAmount) {
    if (!memberSession) return;
    if (!paymentSettings.is_active) {
      return setStatus('Ödeme sistemi aktif değil. Lütfen yönetici ayarlarını kontrol et.');
    }

    setCoinCheckoutLoading(true);
    try {
      const response = await fetch(DEFAULT_CHECKOUT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          member_id: memberSession.id,
          coin_amount: coinAmount,
          provider: paymentSettings.provider || 'stripe',
          source: 'flortbeta_member_coins_page',
        }),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error || 'Checkout endpoint hata döndürdü.');
      }
      if (!result.url) {
        throw new Error('Checkout endpoint geçerli bir url döndürmedi.');
      }
      window.location.href = result.url;
    } catch (err) {
      setStatus(err.message || 'Checkout URL yönlendirmesi sırasında hata oluştu.');
    } finally {
      setCoinCheckoutLoading(false);
    }
  }

  async function saveQuickFacts() {
    if (!selectedThread) return;
    const { error } = await supabase
      .from('thread_quick_facts')
      .upsert({
        member_id: selectedThread.member_id,
        virtual_profile_id: selectedThread.virtual_profile_id,
        notes: quickFactsText,
      }, { onConflict: 'member_id,virtual_profile_id' });
    if (error) return setStatus(error.message);
    setStatus('Quick Facts kaydedildi.');
  }

  async function fetchRegisteredMembers() {
    setLoadingMembers(true);
    const { data, error } = await supabase
      .from('members')
      .select('id, username, created_at')
      .order('created_at', { ascending: false });

    const { data: profileData, error: profileError } = await supabase
      .from('member_profiles')
      .select('member_id, coin_balance, contact_phone');

    setLoadingMembers(false);
    if (error || profileError) return setStatus(error?.message || profileError?.message || 'Üye listesi alınamadı.');

    const profileMap = Object.fromEntries((profileData || []).map((p) => [p.member_id, p]));
    const rows = (data || []).map((member) => ({
      ...member,
      coin_balance: Number(profileMap[member.id]?.coin_balance ?? 100),
      contact_phone: profileMap[member.id]?.contact_phone || '',
    }));
    setRegisteredMembers(rows);
  }

  async function deleteMember(memberId) {
    const { error } = await supabase.from('members').delete().eq('id', memberId);
    if (error) return setStatus(error.message);
    setRegisteredMembers((prev) => prev.filter((m) => m.id !== memberId));
    setStatus('Kullanıcı silindi.');
  }

  function openChatWithProfile(profileId) {
    setSelectedProfileId(profileId);
    setUserView('chat');
  }

  async function sendAdminReply() {
    if (!selectedThread || !adminReply.trim()) return;
    if (memberModeration.blacklisted) {
      return setStatus('Bu kullanıcı kara listede. Yanıt göndermeden önce moderasyon ayarını güncelle.');
    }
    const { error } = await supabase.from('messages').insert({
      member_id: selectedThread.member_id,
      virtual_profile_id: selectedThread.virtual_profile_id,
      sender_role: 'virtual',
      content: adminReply.trim(),
      seen_by_member: false,
      seen_by_admin: true,
    });
    if (error) return setStatus(error.message);
    recordEngagement('admin_reply', selectedThread.member_id, selectedThread.virtual_profile_id, { source: 'admin_reply' });
    setAdminReply('');
    setAiSuggestions([]);
    fetchIncomingThreads();
    fetchThreadMessages(selectedThread.member_id, selectedThread.virtual_profile_id);
    fetchEngagementInsights();
    setStatus('Yanıt gönderildi.');
  }

  async function updateSelectedThreadTag(tag) {
    if (!selectedThread) return;
    try {
      await updateRows(
        'admin_threads',
        { status_tag: tag },
        (q) => q.eq('member_id', selectedThread.member_id).eq('virtual_profile_id', selectedThread.virtual_profile_id)
      );
      await insertRows('thread_events', {
        member_id: selectedThread.member_id,
        virtual_profile_id: selectedThread.virtual_profile_id,
        event_type: 'status_change',
        meta: { status_tag: tag },
      });
    } catch (error) {
      return setStatus(error.message);
    }
    setSelectedThread((prev) => (prev ? { ...prev, status_tag: tag } : prev));
    fetchIncomingThreads();
  }

  async function sendBulkTemplate() {
    const selectedKeys = Object.keys(selectedThreadKeys).filter((k) => selectedThreadKeys[k]);
    if (!selectedKeys.length) return setStatus('Önce en az bir thread seç.');
    if (!bulkTemplate.trim()) return;

    const rows = selectedKeys.map((key) => {
      const [member_id, virtual_profile_id] = key.split('::');
      return {
        member_id,
        virtual_profile_id,
        sender_role: 'virtual',
        content: bulkTemplate,
        seen_by_member: false,
        seen_by_admin: true,
      };
    });

    try {
      await insertRows('messages', rows);
      await insertRows('thread_events', rows.map((row) => ({
        member_id: row.member_id,
        virtual_profile_id: row.virtual_profile_id,
        event_type: 'bulk_sent',
        meta: { template: bulkTemplate },
      })));
    } catch (error) {
      return setStatus(error.message);
    }
    setSelectedThreadKeys({});
    setStatus(`${rows.length} thread için bulk mesaj gönderildi.`);
    fetchIncomingThreads();
  }

  async function fetchAiSuggestions() {
    if (!OPENAI_API_KEY) return setStatus('AI önerileri için VITE_OPENAI_API_KEY tanımla.');
    if (!selectedThread || !threadMessages.length) return;

    const lastMemberMessage = [...threadMessages].reverse().find((m) => m.sender_role === 'member')?.content;
    if (!lastMemberMessage) return;

    setLoadingSuggestions(true);
    setStatus('');

    const prompt = `Kullanıcı mesajı: "${lastMemberMessage}". Flört uygulaması için 3 kısa ve doğal Türkçe cevap öner.`;

    const res = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        input: prompt,
      }),
    });

    setLoadingSuggestions(false);
    if (!res.ok) {
      const txt = await res.text();
      return setStatus(`AI önerisi alınamadı: ${txt}`);
    }

    const data = await res.json();
    const outText = data.output_text || '';
    const lines = outText
      .split('\n')
      .map((l) => l.replace(/^\d+[\).\-]\s*/, '').trim())
      .filter(Boolean)
      .slice(0, 3);
    setAiSuggestions(lines);
  }

  return (
    <div className={`layout ${isAdmin ? 'layout-admin' : ''}`}>
      <header className={`topbar ${isAdmin ? 'topbar-admin' : ''}`}>
        <h1 className="brand"><span className="brand-icon">✦</span> Flort.</h1>
        <div className="topbar-actions">
          {isAdmin && loggedIn && (
            <div className="admin-nav-pills">
              <button type="button" className={`nav-pill ${adminTab === 'chat' ? 'active' : ''}`} onClick={() => setAdminTab('chat')}>Chat</button>
              <button type="button" className={`nav-pill ${adminTab === 'stats' ? 'active' : ''}`} onClick={() => setAdminTab('stats')}>Stats</button>
              <button type="button" className={`nav-pill ${adminTab === 'settings' ? 'active' : ''}`} onClick={() => setAdminTab('settings')}>Settings</button>
              <button type="button" className={`nav-pill ${adminTab === 'payments' ? 'active' : ''}`} onClick={() => setAdminTab('payments')}>Payments</button>
            </div>
          )}
          {loggedIn && !isAdmin && (
            <div className="member-top-actions flex items-center gap-2 rounded-2xl border border-fuchsia-300/40 bg-gradient-to-r from-[#160b2e] via-[#1f1648] to-[#10233f] p-2 shadow-2xl shadow-indigo-900/45 backdrop-blur-xl">
              <button
                type="button"
                className={`rounded-xl px-5 py-2.5 text-sm font-extrabold tracking-[0.02em] transition-all ${userView === 'discover' ? 'bg-gradient-to-r from-fuchsia-500 via-violet-500 to-cyan-400 text-white shadow-lg shadow-fuchsia-500/35' : 'bg-white/10 text-indigo-50 ring-1 ring-white/25 hover:-translate-y-0.5 hover:bg-white/20'}`}
                onClick={() => setUserView('discover')}
              >
                Keşfet
              </button>
              <button
                type="button"
                className={`rounded-xl px-5 py-2.5 text-sm font-extrabold tracking-[0.02em] transition-all ${userView === 'chat' ? 'bg-gradient-to-r from-fuchsia-500 via-violet-500 to-cyan-400 text-white shadow-lg shadow-fuchsia-500/35' : 'bg-white/10 text-indigo-50 ring-1 ring-white/25 hover:-translate-y-0.5 hover:bg-white/20'}`}
                onClick={() => setUserView('chat')}
              >
                Mesajlar
                {totalUnreadCount > 0 && <span className="nav-dot" />}
              </button>
              <button
                type="button"
                className={`rounded-xl px-5 py-2.5 text-sm font-extrabold tracking-[0.02em] transition-all ${userView === 'profile' ? 'bg-gradient-to-r from-fuchsia-500 via-violet-500 to-cyan-400 text-white shadow-lg shadow-fuchsia-500/35' : 'bg-white/10 text-indigo-50 ring-1 ring-white/25 hover:-translate-y-0.5 hover:bg-white/20'}`}
                onClick={() => setUserView('profile')}
              >
                Profilim
              </button>
              <button
                type="button"
                className={`rounded-xl px-5 py-2.5 text-sm font-extrabold tracking-[0.02em] transition-all ${userView === 'coins' ? 'bg-gradient-to-r from-amber-400 via-orange-500 to-pink-500 text-white shadow-lg shadow-orange-400/35' : 'bg-white/10 text-indigo-50 ring-1 ring-white/25 hover:-translate-y-0.5 hover:bg-white/20'}`}
                onClick={() => setUserView('coins')}
              >
                Coin Satın Al
              </button>
              <button
                type="button"
                className="rounded-xl border border-rose-200/50 bg-gradient-to-r from-rose-500 via-pink-500 to-orange-400 px-5 py-2.5 text-sm font-extrabold tracking-[0.02em] text-white shadow-lg shadow-rose-500/35 transition hover:-translate-y-0.5 hover:brightness-110"
                onClick={handleSignOut}
              >
                Çıkış
              </button>
            </div>
          )}
          {!loggedIn && (
            <button className="linkish" onClick={() => setMode(mode === 'user' ? 'admin' : 'user')}>
              {mode === 'user' ? 'Admin girişi' : 'Kullanıcı girişi'}
            </button>
          )}
          {loggedIn && isAdmin && <button onClick={handleSignOut}>Çıkış</button>}
        </div>
      </header>
      {loggedIn && !isAdmin && !onboardingState.completed && (
        <section className="mb-3 rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <strong className="text-amber-900">Hoş geldin! Mini onboarding ({onboardingState.currentStep}/3)</strong>
              <p className="text-sm text-amber-800">
                1) Fotoğraf ekle • 2) Hobi gir • 3) İlk 3 profile aksiyon yap ({Math.min(onboardingActionCount, 3)}/3)
              </p>
            </div>
            <button
              type="button"
              className="w-auto rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600"
              onClick={() => {
                if (!onboardingState.hasPhoto || !onboardingState.hasHobbies) {
                  setUserView('profile');
                } else {
                  setUserView('discover');
                }
              }}
            >
              {(!onboardingState.hasPhoto || !onboardingState.hasHobbies) ? 'Profil adımına git' : 'Aksiyon adımına git'}
            </button>
          </div>
        </section>
      )}

      {!loggedIn ? (
        <section className="relative isolate min-h-[78vh] overflow-hidden rounded-[2rem] border border-slate-200/40 bg-slate-950 px-4 py-6 md:px-8 md:py-8">
          <div className="pointer-events-none absolute -left-16 top-1/4 h-56 w-56 rounded-full bg-fuchsia-500/35 blur-3xl" />
          <div className="pointer-events-none absolute right-0 top-0 h-64 w-64 rounded-full bg-indigo-400/35 blur-3xl" />
          <div className="pointer-events-none absolute bottom-0 right-1/4 h-56 w-56 rounded-full bg-cyan-400/25 blur-3xl" />

          <div className="relative mx-auto grid max-w-6xl gap-6 lg:grid-cols-[430px_1fr]">
            <div className="rounded-[2rem] border border-slate-200/80 bg-white/95 p-6 shadow-2xl shadow-slate-950/25 backdrop-blur-2xl md:p-7">
              <div className="mb-6 space-y-4">
                <div className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-indigo-700">
                  <span className="h-2 w-2 rounded-full bg-emerald-300" />
                  Flort Quantum UI
                </div>
                <div>
                  <p className="text-sm text-slate-500">Yeni nesil sosyal keşif deneyimi</p>
                  <h2 className="mt-1 text-3xl font-semibold leading-tight text-slate-900">
                    {mode === 'admin' ? 'Yönetici girişi' : 'Kullanıcı giriş merkezi'}
                  </h2>
                </div>
              </div>

              <div className="space-y-3.5">
                <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 transition-all focus-within:border-fuchsia-400 focus-within:shadow-lg focus-within:shadow-fuchsia-500/15">
                  <span className="text-lg text-slate-500">👤</span>
                  <input
                    type="text"
                    placeholder={mode === 'admin' ? 'Admin modunda kullanıcı adı kapalı' : 'Kullanıcı adı'}
                    disabled={mode === 'admin'}
                    value={mode === 'admin' ? '' : authForm.username}
                    onChange={(e) => setAuthForm((st) => ({ ...st, username: e.target.value }))}
                    className="flex-1 bg-transparent py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none disabled:cursor-not-allowed disabled:text-slate-400"
                  />
                </div>

                <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 transition-all focus-within:border-cyan-400 focus-within:shadow-lg focus-within:shadow-cyan-500/15">
                  <span className="text-lg text-slate-500">🔐</span>
                  <input
                    type="password"
                    placeholder="Şifre"
                    value={authForm.password}
                    onChange={(e) => setAuthForm((st) => ({ ...st, password: e.target.value }))}
                    className="flex-1 bg-transparent py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none"
                  />
                </div>
              </div>

              <div className="mt-6 space-y-3">
                <button
                  disabled={loading}
                  onClick={signIn}
                  className="w-full rounded-2xl bg-gradient-to-r from-fuchsia-500 via-indigo-500 to-cyan-400 px-5 py-4 text-sm font-semibold text-white shadow-lg shadow-indigo-700/35 transition-all hover:scale-[1.01] hover:shadow-xl hover:shadow-fuchsia-500/35 active:scale-[0.99] disabled:opacity-60"
                >
                  {loading ? 'İşleniyor...' : 'Giriş Yap'}
                </button>
                {mode !== 'admin' && (
                  <button
                    disabled={loading}
                    onClick={signUp}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-100 px-5 py-4 text-sm font-semibold text-slate-900 transition-all hover:bg-slate-200 active:scale-[0.99] disabled:opacity-60"
                  >
                    Hesap Oluştur
                  </button>
                )}
              </div>

              <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                {mode === 'admin'
                  ? 'Admin girişi için tanımlı yönetici şifresini kullan.'
                  : 'Hızlıca hesap oluştur, eşleşmeleri keşfet ve gerçek zamanlı sohbete başla.'}
              </div>
            </div>

            <div className="rounded-[2rem] border border-white/20 bg-gradient-to-br from-slate-900/80 via-indigo-950/75 to-slate-900/85 p-5 shadow-2xl shadow-slate-950/40 md:p-7">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="group relative overflow-hidden rounded-[2rem] border border-white/20 bg-white/10 backdrop-blur-sm">
                  <img
                    src="https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=1000&q=80"
                    className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
                    alt="Flort profil kartı"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-900/30 to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 p-5 text-white">
                    <h3 className="text-2xl font-semibold">Sena, 24</h3>
                    <p className="text-sm text-white/80">İstanbul · Fotoğraf · Dans · Kahve</p>
                  </div>
                </div>

                <div className="flex flex-col gap-3">
                  <div className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-sm">
                    <p className="text-xs uppercase tracking-[0.18em] text-cyan-100/80">Canlı Etkileşim</p>
                    <div className="mt-3 space-y-2">
                      <div className="max-w-[80%] rounded-2xl rounded-tl-sm bg-white px-4 py-3 text-sm text-slate-800 shadow-sm">Selam! Akşam kahve planı var mı? ☕</div>
                      <div className="ml-auto max-w-[80%] rounded-2xl rounded-tr-sm bg-gradient-to-r from-fuchsia-500 to-indigo-500 px-4 py-3 text-sm text-white shadow-lg shadow-indigo-700/30">Olur! 20:30 Nişantaşı nasıl? ✨</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-xl border border-white/15 bg-white/10 px-3 py-2">
                      <p className="text-lg font-bold text-white">98%</p>
                      <p className="text-[11px] text-slate-300">Uyum</p>
                    </div>
                    <div className="rounded-xl border border-white/15 bg-white/10 px-3 py-2">
                      <p className="text-lg font-bold text-white">2.1s</p>
                      <p className="text-[11px] text-slate-300">Yanıt</p>
                    </div>
                    <div className="rounded-xl border border-white/15 bg-white/10 px-3 py-2">
                      <p className="text-lg font-bold text-white">24/7</p>
                      <p className="text-[11px] text-slate-300">Aktif</p>
                    </div>
                  </div>

                  <div className="mt-auto flex items-center gap-2 rounded-full border border-white/20 bg-white/10 p-1.5">
                    <input
                      type="text"
                      placeholder="Bir mesaj yaz..."
                      className="flex-1 bg-transparent px-4 py-2 text-sm text-white placeholder:text-slate-300/70 outline-none"
                      readOnly
                    />
                    <button type="button" className="rounded-full bg-gradient-to-r from-cyan-400 to-indigo-500 px-4 py-2 text-xs font-semibold text-white">
                      Gönder
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      ) : isAdmin ? (
        <main className="admin-modern compact-shell admin-ops">
          <aside className="admin-left card">
            {selectedThread && (
              <div className="meta selected-profile-meta left-profile-meta">
                <h4>Aktif Konuşan Kullanıcı</h4>
                {selectedMemberProfile?.photo_url && <img src={selectedMemberProfile.photo_url} alt={selectedThread.member_username} className="profile-photo" />}
                <p><strong>Kullanıcı Adı:</strong> {selectedThread.member_username}</p>
                <p><strong>Yaş:</strong> {selectedMemberProfile?.age || '-'}</p>
                <p><strong>Şehir:</strong> {selectedMemberProfile?.city || '-'}</p>
                <p><strong>Hobiler:</strong> {selectedMemberProfile?.hobbies || '-'}</p>
                <p><strong>Durum:</strong> {selectedMemberProfile?.status_emoji || '🙂'}</p>
                <p><strong>Kara Liste:</strong> {memberModeration.blacklisted ? 'Evet' : 'Hayır'}</p>
              </div>
            )}

            <div className="panel-title-row panel-head">
              <h3>Mesaj Bekleyen Thread'ler</h3>
            </div>
            <div className="thread-queue modern-thread-queue" ref={threadQueueRef}>
              {sortedIncomingThreads.map((thread) => {
                const threadProfile = profileById[thread.virtual_profile_id];
                const waitingReply = thread.last_sender_role === 'member';
                return (
                  <button
                    key={`${thread.member_id}-${thread.virtual_profile_id}`}
                    onClick={() => setSelectedThread(thread)}
                    className={`thread-item modern ${selectedThread?.member_id === thread.member_id && selectedThread?.virtual_profile_id === thread.virtual_profile_id ? 'active' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={!!selectedThreadKeys[threadKey(thread.member_id, thread.virtual_profile_id)]}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) =>
                        setSelectedThreadKeys((prev) => ({
                          ...prev,
                          [threadKey(thread.member_id, thread.virtual_profile_id)]: e.target.checked,
                        }))
                      }
                    />
                    <span className="thread-avatar-wrap">
                      {threadProfile?.photo_url ? (
                        <img src={threadProfile.photo_url} alt={thread.virtual_name} className="thread-avatar" />
                      ) : (
                        <span className="thread-avatar-fallback">{thread.virtual_name?.slice(0, 1)}</span>
                      )}
                    </span>
                    <span className="thread-copy">
                      <strong>{thread.member_username} → {thread.virtual_name}</strong>
                      {thread.last_message_content && <small>{thread.last_message_content}</small>}
                      {waitingReply && <small className="pending-badge">Cevap bekliyor</small>}
                      {adminTypingByThread[threadKey(thread.member_id, thread.virtual_profile_id)] && <small>• yazıyor...</small>}
                    </span>
                    {adminUnreadByThread[threadKey(thread.member_id, thread.virtual_profile_id)] > 0 && (
                      <span className="unread-pill">{adminUnreadByThread[threadKey(thread.member_id, thread.virtual_profile_id)]}</span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="meta">
              <h4>SLA Paneli</h4>
              <p><strong>Cevaplanmamış thread:</strong> {slaStats.waitingCount}</p>
              <p><strong>Ort. bekleme süresi:</strong> {slaStats.avgWaitMin > 0 && slaStats.avgWaitMin < 1 ? '<1 dk' : `${slaStats.avgWaitMin.toFixed(1)} dk`}</p>
            </div>

            <div className="meta">
              <h4>Engagement (7 Gün)</h4>
              <p><strong>Yoğun saatler:</strong></p>
              <ul className="insight-list">
                {engagementInsights.topHours.map((h) => (
                  <li key={h.label}>{h.label} → {h.count} mesaj</li>
                ))}
              </ul>
              <p><strong>İlgi gören profiller:</strong></p>
              <ul className="insight-list">
                {engagementInsights.topProfiles.map((p) => (
                  <li key={p.name}>{p.name} → {p.count} etkileşim</li>
                ))}
              </ul>
            </div>

            <div className="meta">
              <h4>Bulk Aksiyon</h4>
              <select value={bulkTemplate} onChange={(e) => setBulkTemplate(e.target.value)}>
                {BULK_TEMPLATES.map((tpl) => (
                  <option key={tpl} value={tpl}>{tpl}</option>
                ))}
              </select>
              <button onClick={sendBulkTemplate}>Seçili thread’lere template gönder</button>
            </div>
          </aside>

          <section className="admin-center card">
            {adminTab === 'chat' && (
              <>
                <div className="chat-header admin-center-head">
                  <div>
                    <h3>{selectedThread?.virtual_name || 'Sohbet seç'}</h3>
                    <small>{selectedThreadProfile && onlineProfiles[selectedThreadProfile.id] ? 'Online' : 'Offline'}</small>
                  </div>
                  <select value={selectedThread?.status_tag || 'takip_edilecek'} onChange={(e) => updateSelectedThreadTag(e.target.value)} style={{ width: 'auto' }}>
                    {THREAD_TAGS.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
                  </select>
                  <button type="button" className="drawer-toggle" onClick={() => setAdminDrawerOpen((v) => !v)}>
                    {adminDrawerOpen ? 'Paneli Gizle' : 'Paneli Aç'}
                  </button>
                </div>

                <div className="chat-box admin-chat-box" ref={adminChatBoxRef}>
                  {threadMessages.map((msg) => {
                    const audioUrl = getAudioUrl(msg.content);
                    return (
                      <div key={msg.id} className={`msg ${msg.sender_role}`}>
                        <span>{msg.sender_role === 'member' ? selectedThread?.member_username : selectedThread?.virtual_name}</span>
                        {audioUrl ? <audio controls src={audioUrl} className="audio-player" /> : <p>{msg.content}</p>}
                        <small>
                          {formatTime(msg.created_at)}
                          {msg.sender_role === 'virtual' ? <span className={`ticks ${msg.seen_by_member ? 'seen' : ''}`} title={msg.seen_by_member_at ? `Görüldü: ${formatTime(msg.seen_by_member_at)}` : `Teslim: ${formatTime(msg.created_at)}`}>✓✓</span> : ''}
                        </small>
                      </div>
                    );
                  })}
                </div>

                <div className="quick-replies">
                  {QUICK_REPLIES.map((reply) => (
                    <button key={reply} type="button" className="chip" onClick={() => setAdminReply((prev) => `${prev ? `${prev}\n` : ''}${reply}`)}>{reply}</button>
                  ))}
                  <button type="button" className="chip ai" onClick={fetchAiSuggestions} disabled={loadingSuggestions}>{loadingSuggestions ? 'AI düşünüyor...' : 'AI Önerisi Getir'}</button>
                </div>

                {!!aiSuggestions.length && (
                  <div className="ai-suggestions">
                    {aiSuggestions.map((suggestion) => (
                      <button key={suggestion} type="button" className="chip" onClick={() => setAdminReply(suggestion)}>{suggestion}</button>
                    ))}
                  </div>
                )}

                <textarea
                  className="grow-textarea"
                  placeholder="Sanal profil cevabı"
                  value={adminReply}
                  onChange={(e) => {
                    setAdminReply(e.target.value);
                    autoResizeTextarea(e.target, 260);
                  }}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendAdminReply(); } }}
                />
                <button onClick={sendAdminReply}>Yanıt Gönder</button>
              </>
            )}

            {adminTab === 'stats' && (
              <div className="stats-dashboard">
                <h3>Stats Dashboard ({statsRange === 'daily' ? 'Günlük' : statsRange === 'weekly' ? 'Haftalık' : 'Aylık'})</h3>
                <div className="stats-range-switch">
                  <button type="button" className={statsRange === 'daily' ? 'active' : ''} onClick={() => setStatsRange('daily')}>Günlük</button>
                  <button type="button" className={statsRange === 'weekly' ? 'active' : ''} onClick={() => setStatsRange('weekly')}>Haftalık</button>
                  <button type="button" className={statsRange === 'monthly' ? 'active' : ''} onClick={() => setStatsRange('monthly')}>Aylık</button>
                </div>
                <div className="stats-grid">
                  <div className="meta stat-card"><small>Toplam Mesaj</small><strong>{adminStats.totalMessagesToday}</strong></div>
                  <div className="meta stat-card"><small>Üye Mesajı</small><strong>{adminStats.memberMessagesToday}</strong></div>
                  <div className="meta stat-card"><small>Admin Cevabı</small><strong>{adminStats.adminRepliesToday}</strong></div>
                  <div className="meta stat-card"><small>Cevaplanan Thread</small><strong>{adminStats.respondedThreadsToday}</strong></div>
                  <div className="meta stat-card"><small>Yeni Üye Kaydı</small><strong>{adminStats.newMembersToday}</strong></div>
                  <div className="meta stat-card"><small>Aktif Thread</small><strong>{adminStats.activeThreadsToday}</strong></div>
                  <div className="meta stat-card"><small>Ort. Cevap Süresi</small><strong>{adminStats.avgResponseMinToday.toFixed(1)} dk</strong></div>
                </div>

                <div className="stats-lists">
                  <div className="meta">
                    <p><strong>Yoğun Saatler</strong></p>
                    <ul className="insight-list">
                      {engagementInsights.topHours.map((h) => <li key={h.label}>{h.label} → {h.count}</li>)}
                    </ul>
                  </div>
                  <div className="meta">
                    <p><strong>En Çok İlgi Gören Profiller</strong></p>
                    <ul className="insight-list">
                      {engagementInsights.topProfiles.map((p) => <li key={p.name}>{p.name} → {p.count}</li>)}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {adminTab === 'settings' && (
              <div className="settings-page">
                <div className="meta">
                  <h3>Settings</h3>
                  <label className="toggle-row">
                    <span>Bildirim sesi</span>
                    <input
                      type="checkbox"
                      checked={notificationSoundEnabled}
                      onChange={(e) => setNotificationSoundEnabled(e.target.checked)}
                    />
                  </label>
                </div>

                <div className="meta">
                  <div className="panel-title-row panel-divider">
                    <h3>Sanal Profil Oluştur</h3>
                    <button type="button" className="icon-dice" onClick={fillRandomVirtualProfile} aria-label="Rastgele üret">🎲</button>
                  </div>

                  <label className="floating-field">
                    <input placeholder=" " value={profileForm.name} onChange={(e) => setProfileForm((s) => ({ ...s, name: e.target.value }))} />
                    <span>Ad (boşsa otomatik)</span>
                  </label>
                  <label className="floating-field">
                    <input placeholder=" " type="number" value={profileForm.age} onChange={(e) => setProfileForm((s) => ({ ...s, age: e.target.value }))} />
                    <span>Yaş (boşsa otomatik)</span>
                  </label>
                  <label className="floating-field">
                    <input placeholder=" " value={profileForm.city} onChange={(e) => setProfileForm((s) => ({ ...s, city: e.target.value }))} />
                    <span>Şehir (boşsa otomatik)</span>
                  </label>
                  <label className="floating-field">
                    <input placeholder=" " value={profileForm.gender} onChange={(e) => setProfileForm((s) => ({ ...s, gender: e.target.value }))} />
                    <span>Cinsiyet</span>
                  </label>
                  <label className="floating-field">
                    <textarea placeholder=" " value={profileForm.hobbies} onChange={(e) => setProfileForm((s) => ({ ...s, hobbies: e.target.value }))} />
                    <span>Hobiler</span>
                  </label>

                  <input
                    type="file"
                    accept="image/*"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const url = await uploadImage(file, 'virtual-profiles');
                      if (url) setProfileForm((s) => ({ ...s, photo_url: url }));
                    }}
                  />
                  {profileForm.photo_url && <img src={profileForm.photo_url} alt="Önizleme" className="upload-preview" />}

                  <button onClick={createVirtualProfile}>Kaydet (Foto + Otomatik İsim/Şehir/Yaş)</button>
                </div>

                <div className="meta">
                  <h3>Kayıt Olan Kullanıcılar</h3>
                  {loadingMembers ? (
                    <p>Yükleniyor...</p>
                  ) : (
                    <div className="member-list">
                      {registeredMembers.map((member) => (
                        <div key={member.id} className="member-row">
                          <div>
                            <strong>{member.username}</strong>
                            <small>{new Date(member.created_at).toLocaleString('tr-TR')}</small>
                            <small>Jeton: {member.coin_balance ?? 100}</small>
                            <small>İletişim: {member.contact_phone || '-'}</small>
                          </div>
                          <button type="button" className="danger-btn" onClick={() => deleteMember(member.id)}>Sil</button>
                        </div>
                      ))}
                      {!registeredMembers.length && <p>Kayıtlı kullanıcı yok.</p>}
                    </div>
                  )}
                </div>
              </div>
            )}

            {adminTab === 'payments' && (
              <div className="settings-page">
                <div className="meta">
                  <h3>Ödeme API Entegrasyonu</h3>
                  <p>Coin satın alma akışı Stripe Checkout Session endpointine otomatik gider. Adminin endpoint yazmasına gerek yok.</p>
                  <input
                    placeholder="Provider (örn: iyzico, stripe, paytr)"
                    value={paymentSettings.provider}
                    onChange={(e) => setPaymentSettings((prev) => ({ ...prev, provider: e.target.value }))}
                  />
                  <input
                    readOnly
                    value={DEFAULT_CHECKOUT_ENDPOINT}
                  />
                  <p className="text-xs text-slate-500">Webhook callback adresi: <code>/api/webhook</code> (Stripe Dashboard'dan tanımlanmalı)</p>
                  <label className="toggle-row">
                    <span>Entegrasyon aktif</span>
                    <input
                      type="checkbox"
                      checked={paymentSettings.is_active}
                      onChange={(e) => setPaymentSettings((prev) => ({ ...prev, is_active: e.target.checked }))}
                    />
                  </label>
                  <button type="button" onClick={savePaymentSettings}>Ödeme API Ayarlarını Kaydet</button>
                </div>
              </div>
            )}
          </section>

          {adminDrawerOpen && adminTab === 'chat' && (
            <aside className="admin-right card drawer-panel">
              {selectedThreadProfile && (
                <div className="meta selected-profile-meta">
                  <h4>Seçili Profil Bilgileri</h4>
                  {selectedThreadProfile.photo_url && <img src={selectedThreadProfile.photo_url} alt={selectedThreadProfile.name} className="profile-photo" />}
                  <p><strong>Ad:</strong> {selectedThreadProfile.name}</p>
                  <p><strong>Yaş:</strong> {selectedThreadProfile.age}</p>
                  <p><strong>Şehir:</strong> {selectedThreadProfile.city || '-'}</p>
                  <p><strong>Hobiler:</strong> {selectedThreadProfile.hobbies || '-'}</p>
                </div>
              )}

              <div className="meta">
                <h4>Quick Facts</h4>
                <textarea
                  placeholder="Kullanıcı hakkında önemli notlar (şehir, iş, sınırlar, tercih vb.)"
                  value={quickFactsText}
                  onChange={(e) => setQuickFactsText(e.target.value)}
                />
                <button onClick={saveQuickFacts}>Quick Facts Kaydet</button>
              </div>
              <div className="meta">
                <h4>Moderasyon Araçları</h4>
                <textarea
                  placeholder="Kullanıcı notu"
                  value={memberModeration.note}
                  onChange={(e) => setMemberModeration((prev) => ({ ...prev, note: e.target.value }))}
                />
                <input
                  placeholder="Etiketler (virgülle): riskli, VIP, takip"
                  value={memberModeration.tags}
                  onChange={(e) => setMemberModeration((prev) => ({ ...prev, tags: e.target.value }))}
                />
                <label className="toggle-row">
                  <span>Kara listeye al</span>
                  <input
                    type="checkbox"
                    checked={memberModeration.blacklisted}
                    onChange={(e) => setMemberModeration((prev) => ({ ...prev, blacklisted: e.target.checked }))}
                  />
                </label>
                <button onClick={saveMemberModeration}>Moderasyon Kaydet</button>
              </div>

            </aside>
          )}
        </main>
      ) : userView === 'discover' ? (
        <main className="relative isolate space-y-6 overflow-hidden rounded-[2.2rem] border border-slate-200/70 bg-slate-950 p-4 text-white shadow-[0_30px_100px_-40px_rgba(15,23,42,0.85)] md:p-6">
          <div className="pointer-events-none absolute -left-24 top-0 h-64 w-64 rounded-full bg-fuchsia-500/25 blur-3xl" />
          <div className="pointer-events-none absolute right-10 top-10 h-56 w-56 rounded-full bg-cyan-400/20 blur-3xl" />
          <div className="pointer-events-none absolute bottom-0 right-1/3 h-52 w-52 rounded-full bg-indigo-500/20 blur-3xl" />

          <section className="relative overflow-hidden rounded-[1.8rem] border border-slate-200/80 bg-white/95 p-5 text-slate-900 shadow-2xl shadow-slate-900/10 md:p-6">
            <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-indigo-200/70 blur-3xl" />
            <div className="pointer-events-none absolute -left-10 bottom-0 h-48 w-48 rounded-full bg-cyan-200/60 blur-3xl" />
            <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
              <div className="relative space-y-3">
                <span className="inline-flex w-fit items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-indigo-700">
                  <span className="h-2 w-2 rounded-full bg-emerald-300" />
                  Discover Hub
                </span>
                <h2 className="text-3xl font-semibold leading-tight md:text-4xl">Çağa uyumlu eşleşmeler seni bekliyor ✨</h2>
                <p className="max-w-2xl text-sm text-slate-600 md:text-base">
                  Gelişmiş filtreler ve etkileşim butonlarıyla profilleri hızlıca keşfet, beğen ve tek dokunuşla sohbete başla.
                </p>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-full border border-slate-200 bg-slate-100 px-3 py-1.5 text-slate-700">Toplam profil: {discoverProfiles.length}</span>
                  <span className="rounded-full border border-emerald-300/70 bg-emerald-50 px-3 py-1.5 text-emerald-700">
                    Çevrimiçi: {discoverProfiles.filter((p) => effectiveOnlineProfiles[p.id]).length}
                  </span>
                  <span className="rounded-full border border-indigo-300/70 bg-indigo-50 px-3 py-1.5 text-indigo-700">Spotlight: {spotlightProfiles.length}</span>
                  <span className="rounded-full border border-amber-300/70 bg-amber-50 px-3 py-1.5 text-amber-700">Jeton: {memberProfile.coin_balance ?? 0}</span>
                </div>
                <div className="mt-3 flex items-center justify-between rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 px-4 py-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Jeton Cüzdanı</p>
                    <p className="text-2xl font-extrabold text-amber-900">{memberProfile.coin_balance ?? 0} Jeton</p>
                  </div>
                  <button type="button" className="w-auto rounded-xl bg-amber-500 px-4 py-2 text-sm font-bold text-white hover:bg-amber-600" onClick={() => setUserView('coins')}>
                    Yükleme Yap
                  </button>
                </div>
              </div>

              <div className="relative grid gap-2 sm:grid-cols-2 xl:w-[480px]">
                <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 shadow-sm">
                  <span className="text-sm text-slate-400">⌕</span>
                  <input
                    placeholder="İsim, şehir veya hobi ara"
                    value={profileSearch}
                    onChange={(e) => setProfileSearch(e.target.value)}
                    className="w-full bg-transparent text-sm text-slate-800 placeholder:text-slate-400 outline-none"
                  />
                </label>
                <select
                  value={genderFilter}
                  onChange={(e) => setGenderFilter(e.target.value)}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 outline-none shadow-sm focus:border-cyan-400"
                >
                  <option value="all" className="text-slate-900">Tümü</option>
                  <option value="Kadın" className="text-slate-900">Kadın</option>
                  <option value="Erkek" className="text-slate-900">Erkek</option>
                </select>
                <input
                  placeholder="Şehir filtresi (örn. İstanbul)"
                  value={cityFilter}
                  onChange={(e) => setCityFilter(e.target.value)}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 outline-none shadow-sm focus:border-fuchsia-400"
                />
                <select
                  value={discoverSort}
                  onChange={(e) => setDiscoverSort(e.target.value)}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 outline-none shadow-sm focus:border-indigo-400"
                >
                  <option value="match" className="text-slate-900">Uyuma göre sırala</option>
                  <option value="newest" className="text-slate-900">En yeni profiller</option>
                  <option value="age_asc" className="text-slate-900">Yaşa göre (artan)</option>
                  <option value="online" className="text-slate-900">Önce çevrimiçi</option>
                </select>
              </div>
            </div>
          </section>

          <section className="relative grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
            {discoverProfiles.map((profile) => {
              const hobbyBadges = (profile.hobbies || '')
                .split(',')
                .map((h) => h.trim())
                .filter(Boolean)
                .slice(0, 3);
              const isOnline = !!effectiveOnlineProfiles[profile.id];
              const liked = !!likedProfiles[profile.id];
              const hearted = !!heartedProfiles[profile.id];
              const waved = !!wavedProfiles[profile.id];

              return (
                <article
                  key={profile.id}
                  className="group relative overflow-hidden rounded-[1.6rem] border border-white/15 bg-white/[0.06] p-3 backdrop-blur-md transition-all duration-300 hover:-translate-y-1.5 hover:border-white/35 hover:bg-white/[0.11] hover:shadow-2xl hover:shadow-indigo-900/40"
                >
                  <div className="relative h-[330px] overflow-hidden rounded-[1.2rem]">
                    {profile.photo_url ? (
                      <img src={profile.photo_url} alt={profile.name} className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110" />
                    ) : (
                      <div className="flex h-full items-center justify-center bg-gradient-to-br from-slate-700 via-slate-800 to-slate-900 text-6xl font-semibold text-white/70">
                        {profile.name?.slice(0, 1)}
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-900/35 to-transparent" />
                    <div className="absolute left-3 top-3 rounded-full border border-white/30 bg-black/25 px-3 py-1 text-xs font-medium text-white backdrop-blur-sm">
                      {isOnline ? '🟢 Çevrimiçi' : '⚪ Offline'}
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 space-y-2 p-4">
                      <div>
                        <h3 className="text-2xl font-semibold text-white">{profile.name}, {profile.age}</h3>
                        <p className="text-sm text-slate-200">{profile.city || 'Türkiye'}</p>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {hobbyBadges.length
                          ? hobbyBadges.map((hobby) => (
                            <span key={hobby} className="rounded-full border border-white/25 bg-white/15 px-2.5 py-1 text-[11px] text-slate-100">
                              {hobby}
                            </span>
                          ))
                          : <span className="rounded-full border border-white/25 bg-white/15 px-2.5 py-1 text-[11px] text-slate-100">Yeni tanışma</span>}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
                    <button
                      type="button"
                      className="rounded-xl bg-gradient-to-r from-fuchsia-500 via-indigo-500 to-cyan-400 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-900/35 transition hover:brightness-110"
                      onClick={() => openChatWithProfile(profile.id)}
                    >
                      Mesaj Gönder
                    </button>
                    <button
                      type="button"
                      className={`rounded-xl border px-3 py-2.5 text-sm transition ${liked ? 'border-pink-300/80 bg-pink-400/20 text-pink-100' : 'border-white/25 bg-white/10 text-white hover:bg-white/20'}`}
                      onClick={() => setLikedProfiles((s) => ({ ...s, [profile.id]: !s[profile.id] }))}
                    >
                      {liked ? '★' : '☆'}
                    </button>
                  </div>

                  <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                    <button
                      type="button"
                      className={`rounded-full border px-3 py-1.5 transition ${hearted ? 'border-rose-300/80 bg-rose-400/20 text-rose-100' : 'border-white/20 bg-white/10 text-slate-100 hover:bg-white/20'}`}
                      onClick={() => {
                        setHeartedProfiles((s) => ({ ...s, [profile.id]: !s[profile.id] }));
                        sendReaction(profile.id, 'heart');
                      }}
                    >
                      {hearted ? '❤️ Beğenildi' : '🤍 Kalp At'}
                    </button>
                    <button
                      type="button"
                      className={`rounded-full border px-3 py-1.5 transition ${waved ? 'border-cyan-300/80 bg-cyan-400/20 text-cyan-100' : 'border-white/20 bg-white/10 text-slate-100 hover:bg-white/20'}`}
                      onClick={() => {
                        setWavedProfiles((s) => ({ ...s, [profile.id]: !s[profile.id] }));
                        sendReaction(profile.id, 'wave');
                      }}
                    >
                      {waved ? '👋 Selamlandı' : '👋 Selam Gönder'}
                    </button>
                  </div>
                </article>
              );
            })}
          </section>

          {!discoverProfiles.length && (
            <section className="relative rounded-3xl border border-dashed border-white/25 bg-white/5 p-10 text-center">
              <h3 className="text-xl font-semibold">Bu filtrelerle profil bulunamadı</h3>
              <p className="mt-2 text-sm text-slate-300">Arama kelimesini temizleyip şehir/cinsiyet filtrelerini değiştirerek tekrar dene.</p>
            </section>
          )}
        </main>
      ) : userView === 'profile' ? (
        <main className="mx-auto grid max-w-4xl gap-5 rounded-[2rem] border border-slate-200 bg-white p-5 shadow-lg md:grid-cols-[320px_1fr] md:p-7">
          <aside className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
            <h3 className="text-xl font-semibold text-slate-900">Profilim</h3>
            <p className="mt-2 text-sm text-slate-600">Profilini güncelle, fotoğrafını değiştir ve diğer kullanıcılara nasıl görüneceğini ayarla.</p>
            <div className="mt-4 space-y-2 text-sm text-slate-700">
              <p><strong>Kullanıcı:</strong> {memberSession?.username}</p>
              <p><strong>Durum:</strong> {memberProfile.status_emoji}</p>
              <p><strong>Şehir:</strong> {memberProfile.city || '-'}</p>
            </div>
          </aside>

          <section className="rounded-3xl border border-slate-200 bg-white p-5">
            <h4 className="text-lg font-semibold text-slate-900">Profil düzenleme</h4>
            {memberProfile.photo_url && <img src={memberProfile.photo_url} alt="profil" className="profile-photo mt-4" />}

            <div className="mt-4 grid gap-3">
              <input
                id="member-photo-upload"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const url = await uploadImage(file, 'members');
                  if (url) setMemberProfile((s) => ({ ...s, photo_url: url }));
                }}
              />
              <label
                htmlFor="member-photo-upload"
                className="inline-flex cursor-pointer items-center justify-center rounded-xl border border-slate-200 bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-200"
              >
                Resim Yükle
              </label>
              <input
                placeholder="Yaş"
                type="number"
                value={memberProfile.age}
                onChange={(e) => setMemberProfile((s) => ({ ...s, age: e.target.value }))}
              />
              <input
                placeholder="Şehir"
                value={memberProfile.city}
                onChange={(e) => setMemberProfile((s) => ({ ...s, city: e.target.value }))}
              />
              <textarea
                placeholder="Hobiler"
                value={memberProfile.hobbies}
                onChange={(e) => setMemberProfile((s) => ({ ...s, hobbies: e.target.value }))}
              />
              <select value={memberProfile.status_emoji} onChange={(e) => setMemberProfile((s) => ({ ...s, status_emoji: e.target.value }))}>
                <option value="🙂">🙂 Normal</option>
                <option value="☕">☕ Kahve içiyor</option>
                <option value="💃">💃 Dans ediyor</option>
                <option value="🎧">🎧 Müzik dinliyor</option>
                <option value="🌙">🌙 Dinleniyor</option>
              </select>
              <button onClick={saveOwnProfile}>Profili Kaydet</button>
            </div>
          </section>
        </main>
      ) : userView === 'coins' ? (
        <main className="mx-auto grid max-w-3xl gap-4 rounded-[2rem] border border-amber-200 bg-white p-5 shadow-lg md:p-7">
          <section className="rounded-3xl border border-amber-200 bg-amber-50 p-5">
            <h3 className="text-2xl font-bold text-amber-900">Jeton Satın Al</h3>
            <p className="mt-2 text-sm text-amber-800">Mesaj göndermek için jeton gerekir. Her mesaj/etkileşim {COIN_COST_PER_MESSAGE} jeton harcar.</p>
            <p className="mt-2 text-sm text-amber-900"><strong>Mevcut jeton:</strong> {memberProfile.coin_balance ?? 0}</p>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-5">
            <h4 className="text-lg font-semibold text-slate-900">Canlı Ödeme</h4>
            <p className="mt-1 text-sm text-slate-600">
              Sağlayıcı: <strong>{paymentSettings.provider || '-'}</strong> · Durum: <strong>{paymentSettings.is_active ? 'Aktif' : 'Pasif'}</strong>
            </p>
            <p className="mt-1 break-all text-xs text-slate-500">Checkout URL: {DEFAULT_CHECKOUT_ENDPOINT}</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {[500, 1200, 2500].map((coinPack) => (
                <button
                  key={coinPack}
                  type="button"
                  disabled={coinCheckoutLoading}
                  onClick={() => requestCoinCheckout(coinPack)}
                  className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {coinCheckoutLoading ? 'İşleniyor…' : `${coinPack} Jeton Al`}
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-5">
            <h4 className="text-lg font-semibold text-slate-900">Test Satın Alma</h4>
            <p className="mt-1 text-sm text-slate-600">
              Test için iletişim numarasını <strong>{TEST_CONTACT_NUMBER}</strong> girip gönder. Sistem otomatik <strong>5000</strong> jeton yükler.
            </p>
            <div className="mt-3 grid gap-3">
              <input
                placeholder="İletişim numarası"
                value={memberProfile.contact_phone || ''}
                onChange={(e) => setMemberProfile((prev) => ({ ...prev, contact_phone: e.target.value }))}
              />
              <button type="button" onClick={handleCoinPurchaseTest}>Numarayı Gönder ve 5000 Jeton Yükle</button>
            </div>
          </section>
        </main>
      ) : (
        <main className="dashboard user-grid user-dashboard user-chat-layout compact-shell">
          <aside className="card">
            <h3>Sohbetler</h3>
            <div className="profile-list" ref={profileListRef}>
              {sortedProfiles.map((profile) => (
                <button key={profile.id} onClick={() => setSelectedProfileId(profile.id)} className={`profile-item ${selectedProfileId === profile.id ? 'active' : ''} ${unreadByProfile[profile.id] > 0 ? 'has-unread' : ''}`}>
                  <span className={`avatar-wrap ${unreadByProfile[profile.id] > 0 ? 'ringing' : ''}`}>
                    {profile.photo_url ? <img src={profile.photo_url} alt={profile.name} className="avatar" /> : <span className="avatar-fallback">{profile.name?.slice(0,1)}</span>}
                  </span>
                  <span className="profile-main">
                    <strong>{profile.name}</strong>
                    <small>{profile.city || 'Türkiye'}</small>
                  </span>
                  <span className={`online-dot ${onlineProfiles[profile.id] ? 'on' : ''}`} />
                  {unreadByProfile[profile.id] > 0 && <small>Yeni ({unreadByProfile[profile.id]})</small>}
                </button>
              ))}
            </div>
            {selectedProfile && (
              <div className="meta">
                {selectedProfile.photo_url && <img src={selectedProfile.photo_url} alt={selectedProfile.name} className="profile-photo" />}
                <p><strong>Yaş:</strong> {selectedProfile.age}</p>
                <p><strong>Cinsiyet:</strong> {selectedProfile.gender}</p>
                <p><strong>Şehir:</strong> {selectedProfile.city || '-'}</p>
                <p><strong>Hobiler:</strong> {selectedProfile.hobbies || '-'}</p>
                <p><strong>Ortak ilgi skoru:</strong> %{interestScore}</p>
              </div>
            )}
          </aside>
          <section className="card">
            <h3>Sohbet</h3>
            <div className="chat-box" ref={chatBoxRef}>
              {messages.map((msg) => {
                const audioUrl = getAudioUrl(msg.content);
                return (
                  <div key={msg.id} className={`msg ${msg.sender_role}`}>
                    <span>{msg.sender_role === 'member' ? 'Sen' : selectedProfile?.name}</span>
                    {audioUrl ? <audio controls src={audioUrl} className="audio-player" /> : <p>{msg.content}</p>}
                    <small>
                      {formatTime(msg.created_at)}
                      {msg.sender_role === 'member' ? <span className={`ticks ${msg.seen_by_admin ? 'seen' : ''}`} title={msg.seen_by_admin_at ? `Görüldü: ${formatTime(msg.seen_by_admin_at)}` : `Teslim: ${formatTime(msg.created_at)}`}>✓✓</span> : ''}
                    </small>
                  </div>
                );
              })}
            </div>
            {typingLabel && <div className="typing-indicator">{typingLabel}</div>}
            <div className="row">
              <textarea
                className="grow-textarea"
                placeholder="Mesaj yaz"
                value={newMessage}
                onChange={(e) => {
                  setNewMessage(e.target.value);
                  autoResizeTextarea(e.target, 220);
                }}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
              />
              <button onClick={sendMessage}>Gönder</button>
            </div>
          </section>
          <section className="card">
            <h3>Kendi Profilin</h3>
            {memberProfile.photo_url && <img src={memberProfile.photo_url} alt="profil" className="profile-photo" />}
            <p><strong>Durum:</strong> {memberProfile.status_emoji}</p>
            <p><strong>Yaş:</strong> {memberProfile.age || '-'}</p>
            <p><strong>Şehir:</strong> {memberProfile.city || '-'}</p>
            <p><strong>Hobiler:</strong> {memberProfile.hobbies || '-'}</p>
            <button type="button" onClick={() => setUserView('profile')}>Profilimi Düzenle</button>
          </section>
        </main>
      )}

      {coinPurchaseModalOpen && !isAdmin && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/55 p-4">
          <div className="w-full max-w-md rounded-3xl border border-amber-200 bg-white p-6 shadow-2xl">
            <h3 className="text-xl font-bold text-slate-900">Jetonun Bitti 😕</h3>
            <p className="mt-2 text-sm text-slate-600">
              Mesaj göndermeye devam etmek için jeton satın alman gerekiyor. Bir mesaj/etkileşim {COIN_COST_PER_MESSAGE} jeton harcar.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600"
                onClick={() => {
                  setZeroCoinPromptDismissed(false);
                  setCoinPurchaseModalOpen(false);
                  setUserView('coins');
                }}
              >
                Coin Satın Al
              </button>
              <button
                type="button"
                className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                onClick={() => {
                  setZeroCoinPromptDismissed(true);
                  setCoinPurchaseModalOpen(false);
                }}
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}

      {status && <p className="status">{status}</p>}
    </div>
  );
}
