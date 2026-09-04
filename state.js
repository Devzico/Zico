// =======================================================================
//  state.js - الحالة العامة المشتركة بين كل ملفات الواجهة
// =======================================================================
const State = {
    token: localStorage.getItem('zeko_token') || null,
    currentUser: null,
    customEmojis: {},
    socket: null,

    DEFAULT_AVATAR: '/img/default-avatar.svg',
    DEFAULT_HEADER: '/img/default-header.svg',
    REACTION_EMOJIS: ['❤️', '😂', '👍', '😮', '😢', '🔥'],
    VISIBILITY_OPTIONS: [
        { key: 'public', label: '🌐 عام', icon: '🌐' },
        { key: 'followers', label: '🔒 المتابعون', icon: '🔒' },
        { key: 'private', label: '🔐 خاص', icon: '🔐' }
    ],

    // مسودة المنشور الحالي
    draftFile: null,
    currentVisibility: 'public',
    currentFeedFilter: 'all',

    // الملف الشخصي المعروض حاليًا
    viewedProfileUsername: null,
    viewedProfileData: null,

    // الدردشة
    activeChatId: null,
    activeChatUsername: null,
    pendingReplyMsgId: null,
    chatDraftFile: null,
    onlinePeers: new Set(),
    typingTimeout: null,

    // تفاصيل المنشور
    activePostId: null,

    // التسجيل الصوتي
    mediaRecorder: null,
    audioChunks: [],
    isRecording: false
};

function setToken(token) {
    State.token = token;
    if (token) localStorage.setItem('zeko_token', token);
    else localStorage.removeItem('zeko_token');
}
