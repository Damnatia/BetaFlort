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
  const { user: memberSession, loading: authLoading, signIn: supabaseSignIn, signUp: supabaseSignUp, signOut: supabaseSignOut } = useAuth();
  const [mode, setMode] = useState('user');
  const [authForm, setAuthForm] = useState({ username: '', password: '' });
  const [isAdmin, setIsAdmin] = useState(false);
  const loading = authLoading; 
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

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
  const [paymentSettings, setPaymentSettings] = useState({ provider: '', webhook_url: DEFAULT_CHECKOUT_ENDPOINT, is_active: false });
  const [hourKey, setHourKey] = useState(() => new Date().toISOString().slice(0, 13));
  
  const chatBoxRef = useRef(null);
  const adminChatBoxRef = useRef(null);
  const profileListRef = useRef(null);
  const threadQueueRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  const selectedProfile = useMemo(() => virtualProfiles.find((p) => p.id === selectedProfileId) || null, [selectedProfileId, virtualProfiles]);
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
    return { waitingCount: waiting.length, avgWaitMin, lastReplyMin: selectedThread?.last_message_at ? (now - new Date(selectedThread.last_message_at).getTime()) / 60000 : 0 };
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
    const score = 70 + (hashToInt(seed) % 31);
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

  function threadKey(memberId, profileId) { return `${memberId}::${profileId}`; }

  async function handleSignIn() {
    if (mode === 'admin') {
      if ([ADMIN_PASSWORD, ADMIN_PASSWORD2].includes(authForm.password)) {
        setIsAdmin(true);
        setStatus('Admin girişi başarılı.');
      } else {
        setStatus('Admin şifresi hatalı.');
      }
      return;
    }
    if (!authForm.username || !authForm.password) return setStatus('Kullanıcı adı ve şifre gerekli.');
    if (authForm.password.length < 6) return setStatus('Şifre en az 6 karakter olmalı.');
    const result = await supabaseSignIn(authForm.username, authForm.password);
    if (!result?.ok) setStatus(result?.error || 'Giriş başarısız.');
    else setStatus('Giriş yapıldı.');
  }

  async function handleSignUp() {
    if (mode === 'admin') return setStatus('Admin kayıt olamaz.');
    if (!authForm.username || !authForm.password) return setStatus('Kullanıcı adı ve şifre gerekli.');
    if (authForm.password.length < 6) return setStatus('Şifre en az 6 karakter olmalı.');
    const result = await supabaseSignUp(authForm.username, authForm.password);
    if (!result?.ok) setStatus(result?.error || 'Kayıt başarısız.');
    else setStatus('Kayıt başarılı!');
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

  function getRandomItem(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

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
    } catch { }
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
    fetchOnboardingActionCount();
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

    return () => supabase.removeChannel(channel);
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

    return () => supabase.removeChannel(presenceChannel);
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
    const { data, error } = await supabase.from('member_profiles').select('*').eq('member_id', memberSession.id).maybeSingle();

    if (error) return setStatus(error.message);
    if (!data) {
      await supabase.from('member_profiles').upsert({ member_id: memberSession.id, coin_balance: 100, status_emoji: '🙂' }, { onConflict: 'member_id' });
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
    const { data, error } = await supabase.from('engagement_events').select('id').eq('member_id', memberSession.id).eq('event_type', 'member_message').limit(50);
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
    const { error } = await supabase.from('member_profiles').upsert(payload, { onConflict: 'member_id' });
    if (error) return setStatus(error.message);
    setStatus('Profil bilgilerin kaydedildi.');
  }

  async function consumeCoins(amount) {
    if (!memberSession || isAdmin) return true;
    const current = Number(memberProfile.coin_balance || 0);
    if (current < amount) return false;

    const nextBalance = current - amount;
    const { error } = await supabase.from('member_profiles').update({ coin_balance: nextBalance }).eq('member_id', memberSession.id);
    if (error) { setStatus(error.message); return false; }

    setMemberProfile((prev) => ({ ...prev, coin_balance: nextBalance }));
    return true;
  }

  async function handleCoinPurchaseTest() {
    if (!memberSession) return;
    if ((memberProfile.contact_phone || '').trim() !== TEST_CONTACT_NUMBER) {
      return setStatus(`Test için iletişim numarasını ${TEST_CONTACT_NUMBER} girmen gerekiyor.`);
    }

    const nextBalance = Number(memberProfile.coin_balance || 0) + 5000;
    const { error } = await supabase.from('member_profiles').upsert({ member_id: memberSession.id, coin_balance: nextBalance, contact_phone: memberProfile.contact_phone }, { onConflict: 'member_id' });
    if (error) return setStatus(error.message);
    setMemberProfile((prev) => ({ ...prev, coin_balance: nextBalance }));
    setStatus('Test satın alma başarılı: 5000 jeton yüklendi.');
  }

  async function handleSignOut() {
    if (isAdmin) { setIsAdmin(false); setStatus('Admin çıkışı yapıldı.'); } 
    else { await supabaseSignOut(); }
    
    setSelectedProfileId(null);
    setMessages([]);
    setIncomingThreads([]);
    setSelectedThread(null);
    setUnreadByProfile({});
    setAdminUnreadByThread({});
    setTypingLabel('');
    setUserView('discover');
  }

  async function fetchVirtualProfiles() {
    try {
      const data = await selectRows('virtual_profiles', (q) => q.order('created_at', { ascending: true }));
      setVirtualProfiles(data || []);
      if (!selectedProfileId && data?.length) setSelectedProfileId(data[0].id);
    } catch (error) { setStatus(error.message); }
  }

  async function fetchUnreadCounts() {
    if (!memberSession || isAdmin) return;
    const { data, error } = await supabase.from('messages').select('virtual_profile_id').eq('member_id', memberSession.id).eq('sender_role', 'virtual').eq('seen_by_member', false);
    if (error) return setStatus(error.message);
    const counts = (data || []).reduce((acc, row) => {
      acc[row.virtual_profile_id] = (acc[row.virtual_profile_id] || 0) + 1;
      return acc;
    }, {});
    setUnreadByProfile(counts);
  }

  async function fetchMessages(profileId) {
    const { data, error } = await supabase.from('messages').select('*').eq('virtual_profile_id', profileId).eq('member_id', memberSession.id).order('created_at', { ascending: true });
    if (error) return setStatus(error.message);
    setMessages(data || []);

    await supabase.from('messages').update({ seen_by_member: true, seen_by_member_at: new Date().toISOString() }).eq('virtual_profile_id', profileId).eq('member_id', memberSession.id).eq('sender_role', 'virtual').eq('seen_by_member', false);
    setUnreadByProfile((prev) => ({ ...prev, [profileId]: 0 }));
  }

  async function sendMessage() {
    if (!memberSession || !selectedProfileId || !newMessage.trim()) return;
    const hasCoin = await consumeCoins(COIN_COST_PER_MESSAGE);
    if (!hasCoin) { setCoinPurchaseModalOpen(true); return setStatus(`Yetersiz jeton.`); }

    const slashCommands = { '/selam': 'Selam 👋', '/kahve': 'Kahve içelim mi? ☕' };
    const normalizedMessage = slashCommands[newMessage.trim().toLowerCase()] || newMessage.trim();

    const { error } = await supabase.from('messages').insert({
      member_id: memberSession.id, virtual_profile_id: selectedProfileId, sender_role: 'member', content: normalizedMessage, seen_by_member: true, seen_by_admin: false,
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
    if (!hasCoin) { setCoinPurchaseModalOpen(true); return setStatus(`Yetersiz jeton.`); }
    const templates = { heart: '💘 Kalp gönderdim.', wave: '👋 Selam, sana el salladım.', like: '👍 Profilini beğendim.' };
    const content = templates[reactionType];
    if (!content) return;

    const { error } = await supabase.from('messages').insert({
      member_id: memberSession.id, virtual_profile_id: profileId, sender_role: 'member', content, seen_by_member: true, seen_by_admin: false,
    });
    if (error) return setStatus(error.message);
    recordEngagement('member_message', memberSession.id, profileId, { source: `reaction_${reactionType}` });
    setOnboardingActionCount((prev) => prev + 1);
    setStatus('Etkileşim mesajı gönderildi.');
  }

  async function createVirtualProfile() {
    const auto = buildRandomVirtualProfile();
    const payload = {
      name: profileForm.name || auto.name, age: Number(profileForm.age || auto.age), city: profileForm.city || auto.city, gender: profileForm.gender || 'Kadın', hobbies: profileForm.hobbies || auto.hobbies, photo_url: profileForm.photo_url,
    };
    if (!payload.photo_url) return setStatus('Fotoğraf yükleyip Kaydet tuşuna bas.');

    let { error } = await supabase.from('virtual_profiles').insert(payload);
    if (error?.message?.includes("Could not find the 'photo_url' column")) {
      const retry = await supabase.from('virtual_profiles').insert({ name: payload.name, age: payload.age, city: payload.city, gender: payload.gender, hobbies: payload.hobbies });
      error = retry.error;
    }
    if (error) return setStatus(error.message);
    setProfileForm(initialProfile);
    fetchVirtualProfiles();
    fetchIncomingThreads();
    setStatus(`Sanal profil oluşturuldu: ${payload.name}`);
  }

  async function fetchIncomingThreads() {
    try {
      const data = await selectRows('admin_threads', (q) => q.order('last_message_at', { ascending: false }));
      setIncomingThreads(data || []);
    } catch (error) { setStatus(error.message); }
  }

  async function recordEngagement(eventType, memberId, virtualProfileId, meta = {}) {
    try { await supabase.from('engagement_events').insert({ event_type: eventType, member_id: memberId, virtual_profile_id: virtualProfileId, meta }); } catch {}
  }

  async function fetchEngagementInsights() {
    if (!isAdmin) return;
    const since = new Date(Date.now() - 1000 * 60 * 60 * 24 * 7).toISOString();
    let rows = [];

    const events = await supabase.from('engagement_events').select('created_at, virtual_profile_id, event_type').eq('event_type', 'member_message').gte('created_at', since);
    if (!events.error && events.data?.length) { rows = events.data; } 
    else {
      const fallback = await supabase.from('messages').select('created_at, virtual_profile_id, sender_role').eq('sender_role', 'member').gte('created_at', since);
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

    const topHours = [...hourMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([hour, count]) => ({ label: `${String(hour).padStart(2, '0')}:00`, count }));
    const topProfiles = [...profileMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([profileId, count]) => ({ name: profileById[profileId]?.name || 'Bilinmeyen Profil', count }));
    setEngagementInsights({ topHours, topProfiles });
  }

  async function fetchAdminStats() {
    if (!isAdmin) return;
    const start = new Date();
    if (statsRange === 'daily') start.setHours(0, 0, 0, 0);
    else if (statsRange === 'weekly') start.setDate(start.getDate() - 7);
    else start.setMonth(start.getMonth() - 1);
    const startIso = start.toISOString();

    const [{ data: todayMessages, error: msgErr }, { data: todayMembers, error: memberErr }] = await Promise.all([
      supabase.from('messages').select('member_id, virtual_profile_id, sender_role, created_at').gte('created_at', startIso),
      supabase.from('members').select('id, created_at').gte('created_at', startIso),
    ]);

    if (msgErr || memberErr) return setStatus(msgErr?.message || memberErr?.message || 'Stats alınamadı.');

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
        if (row.sender_role === 'member') lastMemberTs = row.created_at;
        else if (row.sender_role === 'virtual' && lastMemberTs) {
          respondedThreadKeys.add(key);
          const diffMin = (new Date(row.created_at).getTime() - new Date(lastMemberTs).getTime()) / 60000;
          if (diffMin >= 0) responseMinutes.push(diffMin);
          lastMemberTs = null;
        }
      });
    });

    setAdminStats({
      totalMessagesToday: messages.length, memberMessagesToday: memberMessages.length, adminRepliesToday: adminReplies.length,
      respondedThreadsToday: respondedThreadKeys.size, newMembersToday: (todayMembers || []).length, activeThreadsToday: activeThreadKeys.size,
      avgResponseMinToday: responseMinutes.length ? responseMinutes.reduce((a, b) => a + b, 0) / responseMinutes.length : 0,
    });
  }

  async function fetchThreadMessages(memberId, profileId) {
    const { data, error } = await supabase.from('messages').select('*').eq('member_id', memberId).eq('virtual_profile_id', profileId).order('created_at', { ascending: true });
    if (error) return setStatus(error.message);
    setThreadMessages(data || []);
    await supabase.from('messages').update({ seen_by_admin: true, seen_by_admin_at: new Date().toISOString() }).eq('member_id', memberId).eq('virtual_profile_id', profileId).eq('sender_role', 'member').eq('seen_by_admin', false);
  }

  async function fetchQuickFacts(memberId, profileId) {
    const { data, error } = await supabase.from('thread_quick_facts').select('notes').eq('member_id', memberId).eq('virtual_profile_id', profileId).maybeSingle();
    if (!error) setQuickFactsText(data?.notes || '');
  }

  async function fetchMemberProfile(memberId) {
    const { data, error } = await supabase.from('member_profiles').select('age, hobbies, city, photo_url, status_emoji').eq('member_id', memberId).maybeSingle();
    setSelectedMemberProfile(error ? null : (data || null));
  }

  async function fetchMemberModeration(memberId) {
    const { data, error } = await supabase.from('member_moderation').select('notes, tags, is_blacklisted').eq('member_id', memberId).maybeSingle();
    setMemberModeration(error ? { note: '', tags: '', blacklisted: false } : { note: data?.notes || '', tags: (data?.tags || []).join(', '), blacklisted: !!data?.is_blacklisted });
  }

  async function saveMemberModeration() {
    if (!selectedThread) return;
    const payload = { member_id: selectedThread.member_id, notes: memberModeration.note, tags: memberModeration.tags.split(',').map((x) => x.trim()).filter(Boolean), is_blacklisted: !!memberModeration.blacklisted };
    const { error } = await supabase.from('member_moderation').upsert(payload, { onConflict: 'member_id' });
    if (error) return setStatus(error.message);
    setStatus('Moderasyon ayarları kaydedildi.');
  }

  async function fetchPaymentSettings() {
    const { data, error } = await supabase.from('payment_gateway_settings').select('provider, webhook_url, is_active').eq('id', 1).maybeSingle();
    if (!error && data) setPaymentSettings({ provider: data.provider || '', webhook_url: data.webhook_url || DEFAULT_CHECKOUT_ENDPOINT, is_active: !!data.is_active });
  }

  async function fetchPublicPaymentSettings() {
    const { data, error } = await supabase.from('payment_gateway_settings').select('provider, webhook_url, is_active').eq('id', 1).maybeSingle();
    if (!error && data) setPaymentSettings((prev) => ({ ...prev, provider: data.provider || '', webhook_url: data.webhook_url || DEFAULT_CHECKOUT_ENDPOINT, is_active: !!data.is_active }));
  }

  async function savePaymentSettings() {
    const { error } = await supabase.from('payment_gateway_settings').upsert({ id: 1, provider: paymentSettings.provider, webhook_url: DEFAULT_CHECKOUT_ENDPOINT, is_active: paymentSettings.is_active }, { onConflict: 'id' });
    if (error) return setStatus(error.message);
    setStatus('Ödeme API ayarları kaydedildi.');
  }

  async function requestCoinCheckout(coinAmount) {
    if (!memberSession) return;
    if (!paymentSettings.is_active) return setStatus('Ödeme sistemi aktif değil.');
    setCoinCheckoutLoading(true);
    try {
      const response = await fetch(DEFAULT_CHECKOUT_ENDPOINT, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ member_id: memberSession.id, coin_amount: coinAmount, provider: paymentSettings.provider || 'stripe', source: 'flortbeta_member_coins_page' }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Checkout endpoint hata döndürdü.');
      if (!result.url) throw new Error('Checkout endpoint geçerli bir url döndürmedi.');
      window.location.href = result.url;
    } catch (err) { setStatus(err.message || 'Checkout yönlendirmesi sırasında hata oluştu.'); } 
    finally { setCoinCheckoutLoading(false); }
  }

  async function saveQuickFacts() {
    if (!selectedThread) return;
    const { error } = await supabase.from('thread_quick_facts').upsert({ member_id: selectedThread.member_id, virtual_profile_id: selectedThread.virtual_profile_id, notes: quickFactsText }, { onConflict: 'member_id,virtual_profile_id' });
    if (error) return setStatus(error.message);
    setStatus('Quick Facts kaydedildi.');
  }

  async function fetchRegisteredMembers() {
    setLoadingMembers(true);
    const { data, error } = await supabase.from('member_profiles').select('member_id, coin_balance, contact_phone, updated_at').order('updated_at', { ascending: false });
    
    // members tablosundan isimleri de çekmek için (eğer public.members'a erişim varsa) ek query yapabilirsin, şimdilik UI'da kullanıcı olarak göstereceğiz
    setLoadingMembers(false);
    if (error) return setStatus('Üye listesi alınamadı: ' + error.message);
    
    setRegisteredMembers((data || []).map((p) => ({ 
      id: p.member_id, 
      username: p.member_id, // Gerçek username'i members tablosundan almak gerekebilir, şimdilik ID'yi gösteriyoruz
      coin_balance: p.coin_balance, 
      contact_phone: p.contact_phone, 
      created_at: p.updated_at 
    })));
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
    if (memberModeration.blacklisted) return setStatus('Bu kullanıcı kara listede. Yanıt göndermeden önce moderasyon ayarını güncelle.');
    
    const { error } = await supabase.from('messages').insert({
      member_id: selectedThread.member_id, virtual_profile_id: selectedThread.virtual_profile_id, sender_role: 'virtual', content: adminReply.trim(), seen_by_member: false, seen_by_admin: true,
    });
    if (error) return setStatus(error.message);
    recordEngagement('admin_reply', selectedThread.member_id, selectedThread.virtual_profile_id, { source: 'admin_reply' });
    setAdminReply(''); setAiSuggestions([]); fetchIncomingThreads(); fetchThreadMessages(selectedThread.member_id, selectedThread.virtual_profile_id); fetchEngagementInsights();
    setStatus('Yanıt gönderildi.');
  }

  async function updateSelectedThreadTag(tag) {
    if (!selectedThread) return;
    try {
      await updateRows('admin_threads', { status_tag: tag }, (q) => q.eq('member_id', selectedThread.member_id).eq('virtual_profile_id', selectedThread.virtual_profile_id));
      await insertRows('thread_events', { member_id: selectedThread.member_id, virtual_profile_id: selectedThread.virtual_profile_id, event_type: 'status_change', meta: { status_tag: tag } });
    } catch (error) { return setStatus(error.message); }
    setSelectedThread((prev) => (prev ? { ...prev, status_tag: tag } : prev));
    fetchIncomingThreads();
  }

  async function sendBulkTemplate() {
    const selectedKeys = Object.keys(selectedThreadKeys).filter((k) => selectedThreadKeys[k]);
    if (!selectedKeys.length) return setStatus('Önce en az bir thread seç.');
    if (!bulkTemplate.trim()) return;

    const rows = selectedKeys.map((key) => {
      const [member_id, virtual_profile_id] = key.split('::');
      return { member_id, virtual_profile_id, sender_role: 'virtual', content: bulkTemplate, seen_by_member: false, seen_by_admin: true };
    });

    try {
      await insertRows('messages', rows);
      await insertRows('thread_events', rows.map((row) => ({ member_id: row.member_id, virtual_profile_id: row.virtual_profile_id, event_type: 'bulk_sent', meta: { template: bulkTemplate } })));
    } catch (error) { return setStatus(error.message); }
    setSelectedThreadKeys({}); setStatus(`${rows.length} thread için bulk mesaj gönderildi.`); fetchIncomingThreads();
  }

  async function fetchAiSuggestions() {
    if (!OPENAI_API_KEY) return setStatus('AI önerileri için VITE_OPENAI_API_KEY tanımla.');
    if (!selectedThread || !threadMessages.length) return;
    const lastMemberMessage = [...threadMessages].reverse().find((m) => m.sender_role === 'member')?.content;
    if (!lastMemberMessage) return;

    setLoadingSuggestions(true); setStatus('');
    const prompt = `Kullanıcı mesajı: "${lastMemberMessage}". Flört uygulaması için 3 kısa ve doğal Türkçe cevap öner.`;
    const res = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_API_KEY}` }, body: JSON.stringify({ model: 'gpt-4.1-mini', input: prompt }),
    });
    setLoadingSuggestions(false);
    if (!res.ok) return setStatus(`AI önerisi alınamadı: ${await res.text()}`);

    const data = await res.json();
    setAiSuggestions((data.output_text || '').split('\n').map((l) => l.replace(/^\d+[\).\-]\s*/, '').trim()).filter(Boolean).slice(0, 3));
  }

  // --- MODERNIZED UI RENDERING ---
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans selection:bg-fuchsia-500/30">
      
      {/* 🚀 GLOBAL HEADER */}
      <header className={`sticky top-0 z-40 border-b backdrop-blur-xl transition-all ${isAdmin ? 'bg-slate-900/95 border-slate-800' : 'bg-white/80 border-slate-200'} px-6 py-4 shadow-sm`}>
        <div className="max-w-[1440px] mx-auto flex items-center justify-between">
          <h1 className="text-2xl font-black tracking-tight flex items-center gap-2">
            <span className={`flex items-center justify-center w-8 h-8 rounded-lg shadow-inner ${isAdmin ? 'bg-gradient-to-br from-indigo-500 to-purple-600 text-white' : 'bg-gradient-to-br from-fuchsia-500 to-indigo-500 text-white'}`}>✦</span>
            <span className={isAdmin ? 'text-white' : 'bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-600'}>Flort.</span>
          </h1>

          <div className="flex items-center gap-4">
            {isAdmin && loggedIn && (
              <nav className="hidden md:flex bg-slate-800/50 p-1 rounded-xl border border-slate-700/50">
                {['chat', 'stats', 'settings', 'payments'].map((tab) => (
                  <button key={tab} onClick={() => setAdminTab(tab)} className={`px-4 py-2 text-sm font-semibold rounded-lg capitalize transition-all ${adminTab === tab ? 'bg-indigo-500 text-white shadow-md' : 'text-slate-300 hover:text-white hover:bg-slate-700/50'}`}>
                    {tab === 'chat' ? 'Sohbetler' : tab === 'stats' ? 'İstatistikler' : tab === 'settings' ? 'Ayarlar' : 'Ödemeler'}
                  </button>
                ))}
              </nav>
            )}

            {loggedIn && !isAdmin && (
              <nav className="hidden md:flex bg-white/50 p-1 rounded-2xl border border-slate-200/50 shadow-sm backdrop-blur-md">
                {['discover', 'chat', 'profile', 'coins'].map((view) => (
                  <button key={view} onClick={() => setUserView(view)} className={`relative px-5 py-2 text-sm font-bold rounded-xl capitalize transition-all duration-300 ${userView === view ? 'bg-slate-900 text-white shadow-lg shadow-slate-900/20' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}>
                    {view === 'discover' ? 'Keşfet' : view === 'chat' ? 'Mesajlar' : view === 'profile' ? 'Profil' : 'Cüzdan'}
                    {view === 'chat' && totalUnreadCount > 0 && <span className="absolute top-2 right-3 w-2 h-2 bg-rose-500 rounded-full animate-pulse" />}
                  </button>
                ))}
              </nav>
            )}

            <div className="flex items-center gap-3 border-l pl-4 border-slate-200/20">
               {!loggedIn && (
                <button onClick={() => setMode(mode === 'user' ? 'admin' : 'user')} className={`text-sm font-semibold underline underline-offset-4 transition-colors ${isAdmin ? 'text-slate-300 hover:text-white' : 'text-slate-500 hover:text-slate-900'}`}>
                  {mode === 'user' ? 'Admin Girişi' : 'Kullanıcı Girişi'}
                </button>
              )}
              {loggedIn && (
                <button onClick={handleSignOut} className={`px-4 py-2 text-sm font-semibold rounded-xl transition-all ${isAdmin ? 'bg-slate-800 text-rose-400 hover:bg-slate-700' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>Çıkış</button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* 🚀 ONBOARDING BANNER */}
      {loggedIn && !isAdmin && !onboardingState.completed && (
        <div className="bg-amber-100 border-b border-amber-200 px-6 py-3">
          <div className="max-w-[1440px] mx-auto flex flex-wrap items-center justify-between gap-4">
             <div>
              <p className="font-bold text-amber-900">Hoş geldin! Profilini tamamla ({onboardingState.currentStep}/3)</p>
              <p className="text-sm text-amber-800">Fotoğraf ekle, hobilerini gir ve eşleşmelere başla.</p>
            </div>
            <button onClick={() => setUserView((!onboardingState.hasPhoto || !onboardingState.hasHobbies) ? 'profile' : 'discover')} className="bg-amber-600 hover:bg-amber-700 text-white text-sm font-bold px-4 py-2 rounded-lg shadow-sm">
              Adımı Tamamla
            </button>
          </div>
        </div>
      )}

      {/* 🚀 GLOBAL STATUS BANNER */}
      {status && (
        <div className="fixed bottom-6 right-6 z-50 animate-fade-in max-w-sm w-full bg-slate-900 text-white px-5 py-4 rounded-2xl shadow-2xl border border-slate-700 flex items-start gap-3">
          <span className="text-xl">🔔</span>
          <p className="text-sm font-medium leading-tight pt-0.5">{status}</p>
          <button onClick={() => setStatus('')} className="ml-auto text-slate-400 hover:text-white">✕</button>
        </div>
      )}

      {/* 🚀 MAIN CONTENT AREA */}
      <main className="flex-1 flex flex-col max-w-[1440px] w-full mx-auto p-4 md:p-6">
        
        {/* ======================= AUTH SCREEN ======================= */}
        {!loggedIn ? (
          <div className="flex-1 flex items-center justify-center py-10">
            <div className="w-full max-w-[1000px] grid md:grid-cols-2 gap-8 bg-white rounded-[2rem] shadow-2xl overflow-hidden border border-slate-200">
              
              {/* Left Side: Form */}
              <div className="p-8 md:p-12 flex flex-col justify-center">
                <div className="mb-8">
                  <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold mb-4 ${mode === 'admin' ? 'bg-indigo-100 text-indigo-700' : 'bg-fuchsia-100 text-fuchsia-700'}`}>
                    {mode === 'admin' ? 'YÖNETİCİ SİSTEMİ' : 'FLORT PLATFORMU'}
                  </span>
                  <h2 className="text-3xl font-black text-slate-900 tracking-tight">
                    {mode === 'admin' ? 'Kontrol Paneli' : 'Eşleşmeye Başla'}
                  </h2>
                  <p className="text-slate-500 mt-2 font-medium">Lütfen devam etmek için giriş yapın.</p>
                </div>

                <div className="space-y-4">
                  <input
                    type="text"
                    placeholder={mode === 'admin' ? 'Kullanıcı Adı Kapalı' : 'Kullanıcı Adı'}
                    disabled={mode === 'admin'}
                    value={mode === 'admin' ? '' : authForm.username}
                    onChange={(e) => setAuthForm((st) => ({ ...st, username: e.target.value }))}
                    className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-medium focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all disabled:opacity-50"
                  />
                  <input
                    type="password"
                    placeholder="Şifreniz"
                    value={authForm.password}
                    onChange={(e) => setAuthForm((st) => ({ ...st, password: e.target.value }))}
                    className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-medium focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all"
                  />
                </div>

                <div className="mt-8 space-y-3">
                  <button onClick={handleSignIn} disabled={loading} className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-4 rounded-2xl shadow-lg shadow-slate-900/20 transition-transform active:scale-[0.98]">
                    {loading ? 'İşleniyor...' : 'Giriş Yap'}
                  </button>
                  {mode !== 'admin' && (
                    <button onClick={handleSignUp} disabled={loading} className="w-full bg-white hover:bg-slate-50 text-slate-900 border border-slate-200 font-bold py-4 rounded-2xl transition-transform active:scale-[0.98]">
                      Yeni Hesap Oluştur
                    </button>
                  )}
                </div>
              </div>

              {/* Right Side: Graphic */}
              <div className="hidden md:flex relative bg-slate-900 p-12 flex-col justify-end overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-fuchsia-600/20 to-indigo-600/40 mix-blend-overlay" />
                <img src="https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=1000&q=80" alt="Cover" className="absolute inset-0 w-full h-full object-cover opacity-40 mix-blend-luminosity" />
                <div className="relative z-10 text-white">
                  <h3 className="text-3xl font-black mb-2 leading-tight">Yapay Zeka ile<br/>Modern Flört Deneyimi</h3>
                  <p className="text-slate-300 font-medium">Hemen katıl ve sana en uygun eşleşmeleri saniyeler içinde bul.</p>
                </div>
              </div>
            </div>
          </div>
        ) 
        
        /* ======================= ADMIN SCREEN ======================= */
        : isAdmin ? (
          <div className="flex-1 flex flex-col lg:flex-row gap-6 h-[calc(100vh-100px)]">
            
            {/* Admin Left Sidebar */}
            <aside className="w-full lg:w-80 flex flex-col gap-4 overflow-y-auto">
               <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
                 <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">Mesaj Bekleyenler</h3>
                 <div className="flex flex-col gap-2">
                   {sortedIncomingThreads.map((thread) => {
                     const isWait = thread.last_sender_role === 'member';
                     const isActive = selectedThread?.member_id === thread.member_id && selectedThread?.virtual_profile_id === thread.virtual_profile_id;
                     return (
                       <button key={threadKey(thread.member_id, thread.virtual_profile_id)} onClick={() => setSelectedThread(thread)} className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${isActive ? 'bg-indigo-50 border-indigo-200 shadow-sm' : 'bg-slate-50 border-slate-100 hover:border-slate-300'}`}>
                         <div className="relative flex-shrink-0">
                           <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center font-bold text-indigo-700">
                             {thread.virtual_name?.slice(0, 1)}
                           </div>
                           {isWait && <div className="absolute -top-1 -right-1 w-3 h-3 bg-rose-500 border-2 border-white rounded-full" />}
                         </div>
                         <div className="flex-1 min-w-0">
                           <p className="text-sm font-bold text-slate-900 truncate">{thread.member_username} <span className="text-slate-400 font-normal">→ {thread.virtual_name}</span></p>
                           <p className="text-xs text-slate-500 truncate mt-0.5">{isWait ? 'Yanıt bekliyor...' : 'Yanıtlandı'}</p>
                         </div>
                       </button>
                     )
                   })}
                 </div>
               </div>

               <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
                  <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">SLA & Durum</h3>
                  <div className="space-y-2 text-sm text-slate-700">
                    <div className="flex justify-between"><span>Bekleyen Mesaj:</span> <strong className="text-rose-600">{slaStats.waitingCount}</strong></div>
                    <div className="flex justify-between"><span>Ort. Bekleme:</span> <strong>{slaStats.avgWaitMin > 0 && slaStats.avgWaitMin < 1 ? '<1 dk' : `${slaStats.avgWaitMin.toFixed(1)} dk`}</strong></div>
                  </div>
               </div>
            </aside>

            {/* Admin Center - Chat Tab */}
            <main className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
               {adminTab === 'chat' && (
                 <>
                    <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                      <div>
                        <h2 className="text-lg font-bold text-slate-900">{selectedThread?.virtual_name || 'Lütfen bir sohbet seçin'}</h2>
                        <p className="text-xs font-semibold text-emerald-600">Sanal Profil Modülü</p>
                      </div>
                      <select value={selectedThread?.status_tag || 'takip_edilecek'} onChange={(e) => updateSelectedThreadTag(e.target.value)} className="bg-white border border-slate-200 text-sm font-medium py-1.5 px-3 rounded-lg outline-none">
                        {THREAD_TAGS.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
                      </select>
                    </div>

                    <div className="flex-1 overflow-y-auto p-6 space-y-4" ref={adminChatBoxRef}>
                       {!selectedThread && <div className="h-full flex items-center justify-center text-slate-400 font-medium">Soldan bir konuşma seçin.</div>}
                       {threadMessages.map((msg) => (
                         <div key={msg.id} className={`flex flex-col max-w-[80%] ${msg.sender_role === 'member' ? 'items-start mr-auto' : 'items-end ml-auto'}`}>
                            <span className="text-[11px] font-bold text-slate-400 mb-1 px-1">
                              {msg.sender_role === 'member' ? selectedThread?.member_username : selectedThread?.virtual_name}
                            </span>
                            <div className={`px-4 py-2.5 rounded-2xl shadow-sm ${msg.sender_role === 'member' ? 'bg-slate-100 text-slate-900 msg-tail-member' : 'bg-indigo-600 text-white msg-tail-virtual'}`}>
                              <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{msg.content}</p>
                            </div>
                            <span className="text-[10px] text-slate-400 mt-1 px-1">{formatTime(msg.created_at)}</span>
                         </div>
                       ))}
                    </div>

                    <div className="p-4 bg-white border-t border-slate-100 space-y-3">
                       {!!aiSuggestions.length && (
                         <div className="flex flex-wrap gap-2">
                           {aiSuggestions.map((sugg) => (
                             <button key={sugg} onClick={() => setAdminReply(sugg)} className="px-3 py-1.5 bg-fuchsia-50 text-fuchsia-700 hover:bg-fuchsia-100 text-xs font-semibold rounded-full border border-fuchsia-200 transition-colors">
                               ✨ {sugg}
                             </button>
                           ))}
                         </div>
                       )}
                       <div className="flex items-end gap-3">
                         <button onClick={fetchAiSuggestions} disabled={loadingSuggestions} className="w-12 h-12 flex-shrink-0 flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition-colors" title="AI Önerisi Al">
                            🤖
                         </button>
                         <textarea
                           value={adminReply}
                           onChange={(e) => { setAdminReply(e.target.value); autoResizeTextarea(e.target, 150); }}
                           onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendAdminReply(); } }}
                           placeholder="Kullanıcıya yanıt yazın..."
                           className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 resize-none min-h-[48px]"
                         />
                         <button onClick={sendAdminReply} className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-xl shadow-md transition-colors h-12">
                           Gönder
                         </button>
                       </div>
                    </div>
                 </>
               )}
               
               {/* Admin Center - Stats Tab */}
               {adminTab === 'stats' && (
                 <div className="p-6 md:p-8 overflow-y-auto">
                    <h2 className="text-2xl font-bold mb-6 text-slate-900">Sistem İstatistikleri</h2>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                       <div className="panel-card"><p className="kpi-title">Toplam Mesaj</p><p className="kpi-value">{adminStats.totalMessagesToday}</p></div>
                       <div className="panel-card"><p className="kpi-title">Aktif Thread</p><p className="kpi-value kpi-value--primary">{adminStats.activeThreadsToday}</p></div>
                       <div className="panel-card"><p className="kpi-title">Yeni Üye</p><p className="kpi-value kpi-value--success">{adminStats.newMembersToday}</p></div>
                       <div className="panel-card"><p className="kpi-title">Ort. Yanıt Hızı</p><p className="kpi-value kpi-value--warning">{adminStats.avgResponseMinToday.toFixed(1)} <span className="text-sm">dk</span></p></div>
                    </div>
                 </div>
               )}

               {/* Admin Center - Settings Tab (MISSING CODE RESTORED HERE) */}
               {adminTab === 'settings' && (
                 <div className="p-6 md:p-8 overflow-y-auto space-y-8">
                    
                    {/* General Settings */}
                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6">
                      <h3 className="text-lg font-bold text-slate-900 mb-4">Genel Ayarlar</h3>
                      <label className="flex items-center justify-between cursor-pointer max-w-md">
                        <span className="font-semibold text-slate-700">Bildirim Sesi Aktif</span>
                        <input type="checkbox" checked={notificationSoundEnabled} onChange={(e) => setNotificationSoundEnabled(e.target.checked)} className="w-5 h-5 accent-indigo-600 cursor-pointer" />
                      </label>
                    </div>

                    {/* Create Virtual Profile */}
                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-bold text-slate-900">Sanal Profil Oluştur</h3>
                        <button onClick={fillRandomVirtualProfile} className="text-xl bg-white border border-slate-200 rounded-xl px-3 py-1.5 hover:bg-slate-100 transition-colors shadow-sm" title="Rastgele Doldur">🎲 Doldur</button>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <input placeholder="Ad (boşsa otomatik)" value={profileForm.name} onChange={(e) => setProfileForm((s) => ({ ...s, name: e.target.value }))} className="px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500" />
                        <input placeholder="Yaş (boşsa otomatik)" type="number" value={profileForm.age} onChange={(e) => setProfileForm((s) => ({ ...s, age: e.target.value }))} className="px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500" />
                        <input placeholder="Şehir (boşsa otomatik)" value={profileForm.city} onChange={(e) => setProfileForm((s) => ({ ...s, city: e.target.value }))} className="px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500" />
                        <select value={profileForm.gender} onChange={(e) => setProfileForm((s) => ({ ...s, gender: e.target.value }))} className="px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500">
                          <option value="Kadın">Kadın</option>
                          <option value="Erkek">Erkek</option>
                        </select>
                        <textarea placeholder="Hobiler (virgülle ayırın)" value={profileForm.hobbies} onChange={(e) => setProfileForm((s) => ({ ...s, hobbies: e.target.value }))} className="md:col-span-2 px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 min-h-[80px]" />
                      </div>
                      
                      <div className="flex items-center gap-4 mb-6">
                         <label className="bg-white border border-slate-200 px-4 py-2.5 rounded-xl text-sm font-bold text-slate-700 cursor-pointer hover:bg-slate-100 transition-colors shadow-sm">
                           📸 Fotoğraf Yükle
                           <input type="file" accept="image/*" className="hidden" onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; const url = await uploadImage(file, 'virtual-profiles'); if (url) setProfileForm((s) => ({ ...s, photo_url: url })); }} />
                         </label>
                         {profileForm.photo_url && <img src={profileForm.photo_url} alt="Önizleme" className="w-16 h-16 object-cover rounded-xl border border-slate-200 shadow-sm" />}
                      </div>

                      <button onClick={createVirtualProfile} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-6 rounded-xl shadow-md transition-colors">
                        Profili Kaydet (Oto Üretim Dahil)
                      </button>
                    </div>

                    {/* Member List */}
                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-bold text-slate-900">Kayıtlı Kullanıcılar</h3>
                        <button onClick={fetchRegisteredMembers} className="text-sm bg-white border border-slate-200 px-3 py-1.5 rounded-lg shadow-sm hover:bg-slate-100 font-bold">Yenile</button>
                      </div>
                      {loadingMembers ? (
                        <p className="text-slate-500 font-medium">Kullanıcılar yükleniyor...</p>
                      ) : (
                        <div className="space-y-3">
                          {registeredMembers.map((member) => (
                            <div key={member.id} className="flex items-center justify-between bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                              <div className="min-w-0 pr-4">
                                <p className="font-bold text-slate-900 truncate" title={member.username}>{member.username}</p>
                                <p className="text-xs font-semibold text-slate-400 mt-1">Kayıt: {new Date(member.created_at).toLocaleString('tr-TR')}</p>
                                <div className="flex flex-wrap items-center gap-2 mt-2 text-xs font-bold">
                                  <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded-md">Jeton: {member.coin_balance ?? 100}</span>
                                  <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md">İletişim: {member.contact_phone || '-'}</span>
                                </div>
                              </div>
                              <button onClick={() => { if(window.confirm('Bu kullanıcıyı tamamen silmek istediğine emin misin?')) deleteMember(member.id); }} className="px-4 py-2 bg-rose-50 text-rose-600 border border-rose-200 hover:bg-rose-100 font-bold text-sm rounded-xl transition-colors">
                                Sil
                              </button>
                            </div>
                          ))}
                          {!registeredMembers.length && <p className="text-slate-500 font-medium bg-white p-4 rounded-xl border border-slate-200">Henüz kayıtlı kullanıcı bulunmuyor.</p>}
                        </div>
                      )}
                    </div>

                 </div>
               )}

               {/* Admin Center - Payments Tab (MISSING CODE RESTORED HERE) */}
               {adminTab === 'payments' && (
                 <div className="p-6 md:p-8 overflow-y-auto">
                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 max-w-2xl">
                      <h3 className="text-lg font-bold text-slate-900 mb-2">Ödeme API Entegrasyonu</h3>
                      <p className="text-sm text-slate-600 font-medium mb-6">Coin satın alma akışı belirtilen Checkout Session endpointine otomatik gider. Sistem doğrudan bu altyapıyı kullanır.</p>
                      
                      <div className="space-y-5">
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Provider (örn: stripe, paytr)</label>
                          <input placeholder="Provider girin" value={paymentSettings.provider} onChange={(e) => setPaymentSettings((prev) => ({ ...prev, provider: e.target.value }))} className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500" />
                        </div>
                        
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Checkout Endpoint URL</label>
                          <input readOnly value={DEFAULT_CHECKOUT_ENDPOINT} className="w-full px-4 py-3 bg-slate-100 border border-slate-200 rounded-xl text-sm text-slate-500 cursor-not-allowed" />
                          <p className="text-xs text-slate-500 font-medium mt-2">Webhook callback adresi: <code className="bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded">/api/webhook</code></p>
                        </div>

                        <label className="flex items-center justify-between p-4 bg-white border border-slate-200 rounded-xl cursor-pointer shadow-sm mt-4 hover:border-emerald-300 transition-colors">
                          <span className="font-bold text-slate-700">Entegrasyon Aktif</span>
                          <input type="checkbox" checked={paymentSettings.is_active} onChange={(e) => setPaymentSettings((prev) => ({ ...prev, is_active: e.target.checked }))} className="w-5 h-5 accent-emerald-500 cursor-pointer" />
                        </label>

                        <button onClick={savePaymentSettings} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 rounded-xl shadow-md transition-colors mt-2">
                          Ödeme Ayarlarını Kaydet
                        </button>
                      </div>
                    </div>
                 </div>
               )}
            </main>

            {/* Admin Right Sidebar */}
            {adminDrawerOpen && adminTab === 'chat' && (
              <aside className="w-full lg:w-80 flex flex-col gap-4 overflow-y-auto">
                 <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex flex-col items-center text-center">
                    <div className="w-24 h-24 rounded-full bg-slate-200 overflow-hidden mb-3 border-4 border-white shadow-md">
                      {selectedThreadProfile?.photo_url ? <img src={selectedThreadProfile.photo_url} className="w-full h-full object-cover" /> : <div className="w-full h-full bg-indigo-100" />}
                    </div>
                    <h3 className="text-lg font-bold text-slate-900">{selectedThreadProfile?.name || '-'}</h3>
                    <p className="text-sm text-slate-500 font-medium">{selectedThreadProfile?.age} • {selectedThreadProfile?.city}</p>
                 </div>
                 
                 <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
                    <h4 className="text-sm font-bold text-slate-900 mb-2">Hızlı Notlar (Quick Facts)</h4>
                    <textarea value={quickFactsText} onChange={(e)=>setQuickFactsText(e.target.value)} placeholder="Kullanıcı sınırları, özel istekleri..." className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm focus:outline-none min-h-[100px]" />
                    <button onClick={saveQuickFacts} className="w-full mt-2 bg-slate-900 text-white text-xs font-bold py-2 rounded-lg">Notları Kaydet</button>
                 </div>
              </aside>
            )}

          </div>
        )

        /* ======================= USER SCREEN: DISCOVER ======================= */
        : userView === 'discover' ? (
          <div className="space-y-6">
            <div className="bg-white rounded-[2rem] p-6 md:p-8 border border-slate-200 shadow-sm">
              <h2 className="text-3xl font-black text-slate-900 tracking-tight mb-2">Yeni Yüzler Keşfet ✨</h2>
              <p className="text-slate-500 font-medium max-w-2xl">Filtreleri kullanarak kriterlerine uygun profilleri bul ve hemen etkileşime geç.</p>
              
              <div className="mt-8 flex flex-col md:flex-row items-center gap-4 bg-slate-50 p-2 rounded-2xl border border-slate-100">
                <input value={profileSearch} onChange={(e)=>setProfileSearch(e.target.value)} placeholder="🔍 İsim veya hobi ara..." className="w-full md:w-auto flex-1 bg-white border border-slate-200 px-4 py-3 rounded-xl text-sm font-medium outline-none focus:border-fuchsia-400" />
                <select value={genderFilter} onChange={(e)=>setGenderFilter(e.target.value)} className="w-full md:w-40 bg-white border border-slate-200 px-4 py-3 rounded-xl text-sm font-medium outline-none focus:border-fuchsia-400">
                  <option value="all">Tüm Cinsiyetler</option>
                  <option value="Kadın">Kadın</option>
                  <option value="Erkek">Erkek</option>
                </select>
                <input value={cityFilter} onChange={(e)=>setCityFilter(e.target.value)} placeholder="📍 Şehir..." className="w-full md:w-48 bg-white border border-slate-200 px-4 py-3 rounded-xl text-sm font-medium outline-none focus:border-fuchsia-400" />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {discoverProfiles.map(profile => (
                <div key={profile.id} className="group bg-white rounded-3xl border border-slate-200 shadow-sm hover:shadow-xl transition-all duration-300 overflow-hidden flex flex-col">
                  <div className="relative h-72 overflow-hidden bg-slate-100">
                    {profile.photo_url ? (
                      <img src={profile.photo_url} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-5xl font-black text-slate-300">{profile.name.slice(0,1)}</div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 via-transparent to-transparent" />
                    <div className="absolute bottom-4 left-4 right-4">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-xl font-bold text-white leading-tight">{profile.name}, {profile.age}</h3>
                        {effectiveOnlineProfiles[profile.id] && <span className="w-2.5 h-2.5 bg-emerald-400 border border-white rounded-full" title="Çevrimiçi" />}
                      </div>
                      <p className="text-xs font-semibold text-slate-300 flex items-center gap-1">📍 {profile.city || 'Belirtilmemiş'}</p>
                    </div>
                  </div>
                  <div className="p-4 flex flex-col flex-1">
                    <div className="flex flex-wrap gap-1.5 mb-4">
                      {profile.hobbies.split(',').slice(0,3).map(h => h.trim() && <span key={h} className="text-[10px] font-bold px-2 py-1 bg-slate-100 text-slate-600 rounded-md">{h}</span>)}
                    </div>
                    <div className="mt-auto grid grid-cols-3 gap-2">
                       <button onClick={() => { setHeartedProfiles(s => ({...s, [profile.id]: true})); sendReaction(profile.id, 'heart'); }} className={`py-2.5 rounded-xl text-sm font-bold transition-colors ${heartedProfiles[profile.id] ? 'bg-rose-100 text-rose-600' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}>❤️</button>
                       <button onClick={() => { setWavedProfiles(s => ({...s, [profile.id]: true})); sendReaction(profile.id, 'wave'); }} className={`py-2.5 rounded-xl text-sm font-bold transition-colors ${wavedProfiles[profile.id] ? 'bg-cyan-100 text-cyan-600' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}>👋</button>
                       <button onClick={() => openChatWithProfile(profile.id)} className="py-2.5 rounded-xl text-sm font-bold bg-slate-900 hover:bg-slate-800 text-white shadow-md">Mesaj</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )

        /* ======================= USER SCREEN: CHAT ======================= */
        : userView === 'chat' ? (
          <div className="flex-1 flex flex-col md:flex-row gap-6 bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden h-[calc(100vh-140px)]">
             {/* Contact List */}
             <div className="w-full md:w-80 border-r border-slate-100 flex flex-col bg-slate-50/50">
               <div className="p-5 border-b border-slate-100">
                 <h3 className="text-xl font-black text-slate-900">Mesajlarım</h3>
               </div>
               <div className="flex-1 overflow-y-auto p-3 space-y-2" ref={profileListRef}>
                 {sortedProfiles.map(p => (
                   <button key={p.id} onClick={() => setSelectedProfileId(p.id)} className={`w-full flex items-center gap-3 p-3 rounded-2xl transition-all ${selectedProfileId === p.id ? 'bg-white shadow-sm border border-slate-200' : 'hover:bg-slate-100 border border-transparent'}`}>
                     <div className="relative">
                       <div className="w-12 h-12 rounded-full overflow-hidden bg-slate-200">
                         {p.photo_url ? <img src={p.photo_url} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center font-bold text-slate-400">{p.name.slice(0,1)}</div>}
                       </div>
                       {effectiveOnlineProfiles[p.id] && <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-emerald-500 border-2 border-white rounded-full" />}
                     </div>
                     <div className="flex-1 text-left min-w-0">
                       <p className="font-bold text-slate-900 truncate">{p.name}</p>
                       <p className="text-xs text-slate-500 truncate">{p.city}</p>
                     </div>
                     {unreadByProfile[p.id] > 0 && <span className="w-5 h-5 bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center rounded-full">{unreadByProfile[p.id]}</span>}
                   </button>
                 ))}
               </div>
             </div>

             {/* Active Chat */}
             <div className="flex-1 flex flex-col bg-white relative">
                {!selectedProfile ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
                    <span className="text-4xl mb-4">💬</span>
                    <p className="font-medium">Sohbet etmek için bir profil seçin.</p>
                  </div>
                ) : (
                  <>
                    <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-4 bg-white z-10 shadow-sm">
                      <div className="w-10 h-10 rounded-full overflow-hidden bg-slate-200">
                         {selectedProfile.photo_url && <img src={selectedProfile.photo_url} className="w-full h-full object-cover" />}
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-900 leading-tight">{selectedProfile.name}</h3>
                        <p className="text-xs font-semibold text-emerald-500">{effectiveOnlineProfiles[selectedProfile.id] ? 'Çevrimiçi' : 'Çevrimdışı'}</p>
                      </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50/50" ref={chatBoxRef}>
                      {messages.map(msg => (
                        <div key={msg.id} className={`flex flex-col max-w-[75%] ${msg.sender_role === 'member' ? 'items-end ml-auto' : 'items-start mr-auto'}`}>
                          <div className={`px-4 py-2.5 rounded-2xl shadow-sm ${msg.sender_role === 'member' ? 'bg-fuchsia-500 text-white msg-tail-member' : 'bg-white border border-slate-200 text-slate-800 msg-tail-virtual'}`}>
                            <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                          </div>
                          <div className="flex items-center gap-1 mt-1 px-1">
                            <span className="text-[10px] text-slate-400 font-medium">{formatTime(msg.created_at)}</span>
                            {msg.sender_role === 'member' && <span className={`text-[10px] font-bold ${msg.seen_by_admin ? 'text-blue-500' : 'text-slate-300'}`}>✓✓</span>}
                          </div>
                        </div>
                      ))}
                      {typingLabel && <div className="text-xs font-bold text-slate-400 ml-2 animate-pulse">{typingLabel}</div>}
                    </div>

                    <div className="p-4 bg-white border-t border-slate-100">
                      <div className="flex items-end gap-3 bg-slate-50 border border-slate-200 rounded-2xl p-2 focus-within:border-fuchsia-400 focus-within:ring-4 focus-within:ring-fuchsia-500/10 transition-all">
                        <textarea
                          value={newMessage}
                          onChange={(e) => { setNewMessage(e.target.value); autoResizeTextarea(e.target, 120); }}
                          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                          placeholder="Mesajınızı yazın..."
                          className="flex-1 bg-transparent px-3 py-2 text-sm focus:outline-none resize-none min-h-[40px] max-h-[120px]"
                        />
                        <button onClick={sendMessage} className="w-10 h-10 flex items-center justify-center bg-slate-900 hover:bg-slate-800 text-white rounded-xl shadow-md transition-transform active:scale-95">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
                        </button>
                      </div>
                    </div>
                  </>
                )}
             </div>
          </div>
        )

        /* ======================= USER SCREEN: PROFILE & COINS ======================= */
        : (
          <div className="max-w-2xl mx-auto w-full space-y-6">
            <div className="bg-white rounded-[2rem] p-8 border border-slate-200 shadow-sm">
               <h2 className="text-2xl font-black text-slate-900 mb-6">{userView === 'profile' ? 'Profil Ayarları' : 'Jeton Cüzdanı'}</h2>
               {userView === 'profile' ? (
                 <div className="space-y-4">
                   <div className="flex items-center gap-6 mb-6">
                     <div className="w-24 h-24 rounded-full bg-slate-100 border border-slate-200 overflow-hidden">
                       {memberProfile.photo_url && <img src={memberProfile.photo_url} className="w-full h-full object-cover" />}
                     </div>
                     <label className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold rounded-xl cursor-pointer transition-colors">
                       Fotoğraf Değiştir
                       <input type="file" accept="image/*" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if(f){ const url = await uploadImage(f, 'members'); if(url) setMemberProfile(s=>({...s, photo_url:url})); } }} />
                     </label>
                   </div>
                   <input value={memberProfile.age} onChange={e=>setMemberProfile(s=>({...s, age:e.target.value}))} placeholder="Yaşınız" type="number" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-fuchsia-400" />
                   <input value={memberProfile.city} onChange={e=>setMemberProfile(s=>({...s, city:e.target.value}))} placeholder="Yaşadığınız Şehir" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-fuchsia-400" />
                   <textarea value={memberProfile.hobbies} onChange={e=>setMemberProfile(s=>({...s, hobbies:e.target.value}))} placeholder="Hobileriniz (virgülle ayırın)" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-fuchsia-400 min-h-[100px]" />
                   <button onClick={saveOwnProfile} className="w-full py-4 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl shadow-md mt-4">Değişiklikleri Kaydet</button>
                 </div>
               ) : (
                 <div className="space-y-6">
                   <div className="bg-amber-50 border border-amber-200 p-6 rounded-2xl flex items-center justify-between">
                     <div>
                       <p className="text-sm font-bold text-amber-700 uppercase tracking-wider">Mevcut Bakiye</p>
                       <p className="text-4xl font-black text-amber-900">{memberProfile.coin_balance ?? 0} <span className="text-lg font-bold">Jeton</span></p>
                     </div>
                     <span className="text-5xl">🪙</span>
                   </div>
                   <div className="grid grid-cols-3 gap-4">
                     {[500, 1200, 2500].map(amt => (
                       <button key={amt} onClick={() => requestCoinCheckout(amt)} disabled={coinCheckoutLoading} className="py-4 bg-white border border-slate-200 hover:border-emerald-400 rounded-2xl font-bold text-slate-800 flex flex-col items-center justify-center gap-1 shadow-sm transition-all active:scale-95 disabled:opacity-50">
                         <span className="text-emerald-500 text-xl">💎</span>
                         <span>{amt} Jeton</span>
                       </button>
                     ))}
                   </div>
                   
                   {/* TEST PURCHASE BUTTON */}
                   <div className="mt-8 pt-6 border-t border-slate-100">
                     <p className="text-xs text-slate-400 font-bold uppercase mb-3">Test Yükleme (Geliştirici Modu)</p>
                     <div className="flex gap-2">
                       <input value={memberProfile.contact_phone || ''} onChange={(e) => setMemberProfile((prev) => ({ ...prev, contact_phone: e.target.value }))} placeholder={`Telefon (${TEST_CONTACT_NUMBER})`} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-fuchsia-400" />
                       <button onClick={handleCoinPurchaseTest} className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl whitespace-nowrap text-sm">5000 Yükle</button>
                     </div>
                   </div>

                 </div>
               )}
            </div>
          </div>
        )}
      </main>

      {/* 🚀 OUT OF COINS MODAL */}
      {coinPurchaseModalOpen && !isAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white p-8 rounded-[2rem] max-w-sm w-full shadow-2xl border border-slate-100">
            <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center text-2xl mb-4">😮</div>
            <h3 className="text-2xl font-black text-slate-900 mb-2">Jetonun Bitti!</h3>
            <p className="text-sm font-medium text-slate-500 mb-6">Sohbete veya etkileşime devam edebilmek için cüzdanına jeton eklemen gerekiyor.</p>
            <div className="flex flex-col gap-3">
              <button onClick={() => { setZeroCoinPromptDismissed(false); setCoinPurchaseModalOpen(false); setUserView('coins'); }} className="w-full py-3.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl shadow-md">Jeton Satın Al</button>
              <button onClick={() => { setZeroCoinPromptDismissed(true); setCoinPurchaseModalOpen(false); }} className="w-full py-3.5 bg-slate-50 hover:bg-slate-100 text-slate-600 font-bold rounded-xl border border-slate-200">Kapat</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
