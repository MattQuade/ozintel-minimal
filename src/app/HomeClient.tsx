'use client';

import { useState, useEffect, useRef } from 'react';
import { getAlertLocation } from '@/lib/alerts/getAlertLocation';
import VoiceNavBar from '@/components/VoiceNavBar';

type Contact = {
  name: string;
  phone: string;
};

type UserProfile = {
  name: string;
  email: string;
  phone: string;
  status: 'pending' | 'approved' | 'blocked';
  smsCount: number;
  smsMonth?: string;
  permissions: {
    accounting: boolean;
    pubOps: boolean;
    forestryOps: boolean;
  };
  shares?: {
    pubOps: string[];
  };
  lastAlert?: {
    timestamp: number;
    lat: number;
    lng: number;
  } | null;
};

const API_BASE = "";

// ---------- Cookie helpers ----------
const COOKIE_NAME = 'ozintel_user_email';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

function normalizeEmailClient(email: string) {
  return String(email || "")
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, '')
    .trim()
    .toLowerCase();
}

function emailsMatch(a: string, b: string) {
  return normalizeEmailClient(a) === normalizeEmailClient(b);
}

/** Strip invisible chars before restore lookup (same rules as server). */
function normalizeRestoreQuery(query: string) {
  return String(query || "")
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, '')
    .trim();
}

function setUserCookie(email: string) {
  if (typeof document === 'undefined') return;
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(email)}; max-age=${COOKIE_MAX_AGE}; path=/; SameSite=Lax; Secure`;
}

function getUserCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(^| )' + COOKIE_NAME + '=([^;]+)'));
  return match ? decodeURIComponent(match[2]) : null;
}

function clearUserCookie() {
  if (typeof document === 'undefined') return;
  document.cookie = `${COOKIE_NAME}=; max-age=0; path=/; SameSite=Lax; Secure`;
}

type HomeClientProps = {
  initialSignup?: string | null;
  initialRestore?: string | null;
  initialContact?: string | null;
  initialContactList?: string | null;
  initialAlert?: string | null;
  initialAlertSent?: string | null;
  initialAlertFailed?: string | null;
  initialSignupReason?: string | null;
  initialUser?: UserProfile | null;
  initialSafeContacts?: Contact[];
  initialEmergencyContacts?: Contact[];
};

function signupStatusMessage(signup: string | null | undefined, reason?: string | null) {
  if (signup === 'ok') {
    return '✅ Registration submitted! Pending admin approval.';
  }
  if (signup === 'exists') {
    return '⚠️ That email is already registered. Use Restore My Account.';
  }
  if (signup === 'error') {
    return `❌ Signup failed: ${reason || 'Please try again.'}`;
  }
  return '';
}

function restoreStatusMessage(
  restore: string | null | undefined,
  reason?: string | null,
  hasUser?: boolean
) {
  if (restore === 'ok') {
    return hasUser
      ? '✅ Account restored — your status is shown above.'
      : '✅ Account restored. If status is missing, pull to refresh this page.';
  }
  if (restore === 'missing') {
    return `❌ ${reason || 'No account found. Use the signup email or mobile.'}`;
  }
  if (restore === 'error') {
    return `❌ Restore failed: ${reason || 'Please try again.'}`;
  }
  return '';
}

function contactStatusMessage(
  contact: string | null | undefined,
  list?: string | null,
  reason?: string | null
) {
  if (contact === 'added') {
    const kind = list === 'emergency' ? 'Emergency' : 'Safe';
    return `✅ ${kind} contact saved.`;
  }
  if (contact === 'removed') {
    return '✅ Contact removed.';
  }
  if (contact === 'error') {
    return `❌ ${reason || 'Could not save contact.'}`;
  }
  return '';
}

function alertStatusMessage(
  alert: string | null | undefined,
  sent?: string | null,
  failed?: string | null,
  reason?: string | null
) {
  if (alert === 'safe-ok') {
    const n = sent || '1';
    const failNote = failed ? ` (${failed} failed)` : '';
    return `✅ Safe arrival alert sent to ${n} contact${n === '1' ? '' : 's'}${failNote}.`;
  }
  if (alert === 'emergency-ok') {
    const n = sent || '1';
    const failNote = failed ? ` (${failed} failed)` : '';
    return `🚨 Emergency alert sent to ${n} contact${n === '1' ? '' : 's'}${failNote}.`;
  }
  if (alert === 'error') {
    return `❌ ${reason || 'Could not send alert.'}`;
  }
  return '';
}

export default function HomePage({
  initialSignup = null,
  initialRestore = null,
  initialContact = null,
  initialContactList = null,
  initialAlert = null,
  initialAlertSent = null,
  initialAlertFailed = null,
  initialSignupReason = null,
  initialUser = null,
  initialSafeContacts = [],
  initialEmergencyContacts = [],
}: HomeClientProps) {
  const [safeContacts, setSafeContacts] = useState<Contact[]>(
    () => initialSafeContacts || []
  );
  const [emergencyContacts, setEmergencyContacts] = useState<Contact[]>(
    () => initialEmergencyContacts || []
  );
  
  const [safePhone, setSafePhone] = useState<string>('');
  const [safeName, setSafeName] = useState<string>('');
  const [emergencyPhone, setEmergencyPhone] = useState<string>('');
  const [emergencyName, setEmergencyName] = useState<string>('');
  
  const [status, setStatus] = useState<string>(() =>
    signupStatusMessage(initialSignup, initialSignupReason) ||
    restoreStatusMessage(
      initialRestore,
      initialSignupReason,
      Boolean(initialUser)
    ) ||
    contactStatusMessage(initialContact, initialContactList, initialSignupReason) ||
    alertStatusMessage(
      initialAlert,
      initialAlertSent,
      initialAlertFailed,
      initialSignupReason
    )
  );
  const [smsCount, setSmsCount] = useState<number>(0);
  const [isSendingAlert, setIsSendingAlert] = useState(false);
  const cancelSendRef = useRef(false);
  const [signupBusy, setSignupBusy] = useState(false);

  const [showSignUp, setShowSignUp] = useState<boolean>(false);
  const [signUpName, setSignUpName] = useState<string>('');
  const [signUpEmail, setSignUpEmail] = useState<string>('');
  const [signUpPhone, setSignUpPhone] = useState<string>('');
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(
    () => initialUser
  );

  const [showAdminLogin, setShowAdminLogin] = useState<boolean>(false);
  const [adminEmailInput, setAdminEmailInput] = useState<string>('');
  const [adminPassInput, setAdminPassInput] = useState<string>('');
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState<boolean>(false);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [selectedEditUser, setSelectedEditUser] = useState<UserProfile | null>(null);

  const [manualName, setManualName] = useState('');
  const [manualEmail, setManualEmail] = useState('');
  const [manualPhone, setManualPhone] = useState('+614');
  const [manualApproved, setManualApproved] = useState(true);

  const [showRestore, setShowRestore] = useState(false);
  const [restoreEmail, setRestoreEmail] = useState('');
  const [dataDirConfigured, setDataDirConfigured] = useState<boolean | null>(null);

  const loadContactsFromServer = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/contacts`, { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      if (data.success) {
        if (Array.isArray(data.safe)) setSafeContacts(data.safe);
        if (Array.isArray(data.emergency)) setEmergencyContacts(data.emergency);
      }
    } catch (err) {
      console.error('Contacts load error:', err);
    }
  };

  const restoreFromServer = async (query: string, silent = false) => {
    try {
      const normalizedQuery = normalizeRestoreQuery(query);
      const res = await fetch(`${API_BASE}/api/users/restore`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ query: normalizedQuery }),
      });
      const data = await res.json();
      if (data.success && data.user) {
        const found = data.user as UserProfile;
        setCurrentUser(found);
        localStorage.setItem('ozintel_current_user', JSON.stringify(found));
        setUserCookie(found.email);
        await loadContactsFromServer();
        if (!silent) {
          if (found.status === 'approved') {
            setStatus("✅ Account restored – you are approved and ready to send alerts.");
          } else if (found.status === 'blocked') {
            setStatus("🚫 Account restored but it is currently blocked.");
          } else {
            setStatus("⏳ Account restored – still pending admin approval.");
          }
        }
        return true;
      }

      clearUserCookie();
      localStorage.removeItem('ozintel_current_user');
      setCurrentUser(null);
      if (!silent) {
        setStatus(
          data.error ||
            "No account found with those details. Use the email, mobile number, or exact full name from signup."
        );
      }
      return false;
    } catch (err) {
      console.error("Restore error:", err);
      if (!silent) setStatus("Could not restore account. Please try again.");
    }
    return false;
  };

  useEffect(() => {
    try {
      const storedUser = localStorage.getItem('ozintel_current_user');
      const adminAuth = localStorage.getItem('ozintel_admin_auth');

      // Prefer server session (cookie → SSR) over stale localStorage.
      if (initialUser) {
        localStorage.setItem('ozintel_current_user', JSON.stringify(initialUser));
        setUserCookie(initialUser.email);
      } else if (storedUser) {
        setCurrentUser(JSON.parse(storedUser));
      }
      if (adminAuth === 'true') setIsAdminAuthenticated(true);

      if (initialUser) {
        const storedSafe = localStorage.getItem('ozintel_safe_contacts');
        const storedEmergency = localStorage.getItem('ozintel_emergency_contacts');
        const localSafe: Contact[] = storedSafe ? JSON.parse(storedSafe) : [];
        const localEmergency: Contact[] = storedEmergency
          ? JSON.parse(storedEmergency)
          : [];
        const serverEmpty =
          (initialSafeContacts || []).length === 0 &&
          (initialEmergencyContacts || []).length === 0;
        if (
          serverEmpty &&
          (localSafe.length > 0 || localEmergency.length > 0)
        ) {
          void (async () => {
            for (const c of localSafe) {
              await fetch(`${API_BASE}/api/contacts`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Accept: 'application/json',
                },
                body: JSON.stringify({ list: 'safe', ...c }),
              });
            }
            for (const c of localEmergency) {
              await fetch(`${API_BASE}/api/contacts`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Accept: 'application/json',
                },
                body: JSON.stringify({ list: 'emergency', ...c }),
              });
            }
            await loadContactsFromServer();
          })();
        }
      } else {
        const storedSafe = localStorage.getItem('ozintel_safe_contacts');
        const storedEmergency = localStorage.getItem(
          'ozintel_emergency_contacts'
        );
        if (storedSafe && (initialSafeContacts || []).length === 0) {
          setSafeContacts(JSON.parse(storedSafe));
        }
        if (
          storedEmergency &&
          (initialEmergencyContacts || []).length === 0
        ) {
          setEmergencyContacts(JSON.parse(storedEmergency));
        }
      }
    } catch (e) {
      console.error("Storage load error:", e);
    }

    fetchUsers();

    const cookieEmail = getUserCookie();
    if (cookieEmail && !initialUser) {
      restoreFromServer(cookieEmail, true);
    }
  }, []);

  useEffect(() => {
    if (!currentUser) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/users`);
        const data = await res.json();
        if (data.success) {
          const latest = data.users.find((u: UserProfile) =>
            emailsMatch(u.email, currentUser.email)
          );
          if (latest) {
            setCurrentUser(latest);
            localStorage.setItem('ozintel_current_user', JSON.stringify(latest));
          } else {
            clearUserCookie();
            localStorage.removeItem('ozintel_current_user');
            setCurrentUser(null);
            setStatus("Your account no longer exists.");
          }
        }
      } catch (err) {
        console.error("Status sync error:", err);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [currentUser]);

  const fetchUsers = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/users`);
      const data = await res.json();
      if (data.success && Array.isArray(data.users)) {
        setAllUsers(data.users);
      }
      if (typeof data.persistentDisk === 'boolean') {
        setDataDirConfigured(data.persistentDisk);
      }
    } catch (err) {
      console.error("Failed to load users from server:", err);
    }
  };

  const saveContacts = (updatedSafe: Contact[], updatedEmergency: Contact[]) => {
    setSafeContacts(updatedSafe);
    setEmergencyContacts(updatedEmergency);
    try {
      localStorage.setItem('ozintel_safe_contacts', JSON.stringify(updatedSafe));
      localStorage.setItem('ozintel_emergency_contacts', JSON.stringify(updatedEmergency));
    } catch (e) {
      console.error("Storage save error:", e);
    }
  };

  // Surface ?signup= / ?restore= / ?contact= / ?alert= from native form POST redirects.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const signup = params.get('signup') || initialSignup;
    const restore = params.get('restore') || initialRestore;
    const contact = params.get('contact') || initialContact;
    const list = params.get('list') || initialContactList;
    const alertParam = params.get('alert') || initialAlert;
    const sent = params.get('sent') || initialAlertSent;
    const failed = params.get('failed') || initialAlertFailed;
    const reason = params.get('reason') || initialSignupReason;
    const signupMsg = signupStatusMessage(signup, reason);
    const restoreMsg = restoreStatusMessage(
      restore,
      reason,
      Boolean(currentUser || initialUser)
    );
    const contactMsg = contactStatusMessage(contact, list, reason);
    const alertMsg = alertStatusMessage(alertParam, sent, failed, reason);
    if (signupMsg) {
      setStatus(signupMsg);
      if (signup === 'ok' || signup === 'exists') setShowSignUp(false);
    } else if (restoreMsg) {
      setStatus(restoreMsg);
      if (restore === 'ok') setShowRestore(false);
    } else if (contactMsg) {
      setStatus(contactMsg);
    } else if (alertMsg) {
      setStatus(alertMsg);
    }
    if (
      params.has('signup') ||
      params.has('restore') ||
      params.has('contact') ||
      params.has('alert')
    ) {
      window.history.replaceState({}, '', '/');
    }
  }, [
    initialSignup,
    initialRestore,
    initialContact,
    initialContactList,
    initialAlert,
    initialAlertSent,
    initialAlertFailed,
    initialSignupReason,
    initialUser,
    currentUser,
  ]);

  const handleSignUpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (signupBusy) return;
    const form = e.currentTarget as HTMLFormElement;
    const fd = new FormData(form);
    const name =
      String(fd.get('name') || '').trim() || signUpName.trim();
    const email =
      String(fd.get('email') || '').trim() || signUpEmail.trim();
    const phone =
      String(fd.get('phone') || '').trim() || signUpPhone.trim();
    if (!name || !email || !phone) {
      setStatus('❌ Please fill in all sign-up fields.');
      return;
    }

    setSignupBusy(true);
    setStatus('Submitting registration…');
    try {
      // /api/signup creates the user and notifies admin in the background —
      // do not call /api/send-sms here (that used to hang the whole UI).
      const res = await fetch(`${API_BASE}/api/signup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ name, email, phone }),
      });

      const data = await res.json().catch(() => ({}));

      if (data.success) {
        if (Array.isArray(data.users)) setAllUsers(data.users);
        setCurrentUser(data.user);
        localStorage.setItem('ozintel_current_user', JSON.stringify(data.user));
        setUserCookie(data.user.email);
        setShowSignUp(false);
        setSignUpName('');
        setSignUpEmail('');
        setSignUpPhone('');
        setStatus('✅ Registration submitted! Pending admin approval.');
      } else if (res.status === 409 || data.error === 'User already exists') {
        setStatus(
          '⚠️ That email is already registered. Use Restore My Account.'
        );
      } else {
        setStatus('❌ Signup failed: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      console.error(err);
      // If fetch fails (offline / dead JS mid-flight), let the browser try
      // a native form POST on the next submit — but still show feedback now.
      setStatus(
        '❌ Signup could not complete in-app. Tap Submit again — it will use the backup form path.'
      );
    } finally {
      setSignupBusy(false);
    }
  };

  const handleRestoreAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    const form = e.currentTarget as HTMLFormElement;
    const fd = new FormData(form);
    const query = normalizeRestoreQuery(
      String(fd.get('restore') || fd.get('query') || '').trim() || restoreEmail
    );
    if (!query) {
      setStatus('❌ Please enter your email, mobile number, or full name from signup.');
      return;
    }
    setStatus('Restoring account…');
    const success = await restoreFromServer(query);
    if (success) {
      setShowRestore(false);
      setRestoreEmail('');
    }
  };

  const handleManualAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualName.trim() || !manualEmail.trim() || !manualPhone.trim()) {
      alert("Please fill in all fields.");
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: manualName.trim(),
          email: manualEmail.trim(),
          phone: manualPhone.trim()
        })
      });

      const data = await res.json();

      if (data.success) {
        if (manualApproved) {
          await fetch(`${API_BASE}/api/users`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: manualEmail.trim(), status: 'approved' })
          });
        }

        fetchUsers();
        setManualName('');
        setManualEmail('');
        setManualPhone('+614');
        setManualApproved(true);
        setStatus("✅ User added successfully.");
      } else {
        alert("Failed to add user: " + (data.error || "Unknown error"));
      }
    } catch (err) {
      console.error(err);
      alert("Failed to add user.");
    }
  };

  const handleAdminLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (adminEmailInput.trim().toLowerCase() === 'mattquade2000@gmail.com' && adminPassInput === 'Woodlands2050!') {
      setIsAdminAuthenticated(true);
      localStorage.setItem('ozintel_admin_auth', 'true');
      setShowAdminLogin(false);
      setStatus("🔓 Admin panel unlocked successfully.");
      fetchUsers();
    } else {
      alert("Invalid admin credentials.");
    }
  };

  const approveUser = async (email: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/users`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, status: 'approved' })
      });
      const data = await res.json();
      if (data.success) {
        setAllUsers(data.users);
        if (currentUser && currentUser.email === email) {
          const updated = { ...currentUser, status: 'approved' as const };
          setCurrentUser(updated);
          localStorage.setItem('ozintel_current_user', JSON.stringify(updated));
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const blockUser = async (email: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/users`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, status: 'blocked' })
      });
      const data = await res.json();
      if (data.success) {
        setAllUsers(data.users);
        if (currentUser && currentUser.email === email) {
          const updated = { ...currentUser, status: 'blocked' as const };
          setCurrentUser(updated);
          localStorage.setItem('ozintel_current_user', JSON.stringify(updated));
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const deleteUser = async (email: string) => {
    if (!confirm(`Permanently delete user ${email}? This cannot be undone.`)) return;
    try {
      const res = await fetch(`${API_BASE}/api/users?email=${encodeURIComponent(email)}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        setAllUsers(data.users);
        if (currentUser && currentUser.email === email) {
          setCurrentUser(null);
          localStorage.removeItem('ozintel_current_user');
          clearUserCookie();
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const updatePermissions = async (email: string, key: 'accounting' | 'pubOps' | 'forestryOps', val: boolean) => {
    const user = allUsers.find(u => u.email === email);
    if (!user) return;

    const newPermissions = { ...user.permissions, [key]: val };

    try {
      const res = await fetch(`${API_BASE}/api/users`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, permissions: newPermissions })
      });
      const data = await res.json();
      if (data.success) {
        setAllUsers(data.users);
        if (currentUser && currentUser.email === email) {
          const updated = { ...currentUser, permissions: newPermissions };
          setCurrentUser(updated);
          localStorage.setItem('ozintel_current_user', JSON.stringify(updated));
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const updatePubOpsShare = async (ownerEmail: string, granteeEmail: string, enabled: boolean) => {
    const owner = allUsers.find(u => u.email === ownerEmail);
    if (!owner) return;
    const current = new Set((owner.shares?.pubOps || []).map(e => e.toLowerCase()));
    const g = granteeEmail.toLowerCase();
    if (enabled) current.add(g);
    else current.delete(g);
    try {
      const res = await fetch(`${API_BASE}/api/users`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: ownerEmail,
          shares: { pubOps: [...current] },
        }),
      });
      const data = await res.json();
      if (data.success) {
        setAllUsers(data.users);
      } else {
        alert(data.error || 'Failed to update Pub Ops share');
      }
    } catch (err) {
      console.error(err);
      alert('Failed to update Pub Ops share');
    }
  };

  /** Prefer DOM/FormData so mobile autofill still works even if React state lagged. */
  const readContactFields = (
    form: HTMLFormElement,
    phoneState: string,
    nameState: string
  ) => {
    const fd = new FormData(form);
    const phoneFromForm = String(fd.get('phone') || '').trim();
    const nameFromForm = String(fd.get('name') || '').trim();
    return {
      phone: phoneFromForm || phoneState.trim(),
      name: nameFromForm || nameState.trim(),
    };
  };

  const addSafeContact = async (e?: React.FormEvent<HTMLFormElement>) => {
    e?.preventDefault();
    const form = e?.currentTarget;
    const { phone, name } = form
      ? readContactFields(form, safePhone, safeName)
      : { phone: safePhone.trim(), name: safeName.trim() };

    if (!phone || !name) {
      setStatus('❌ Please enter both a phone number and a name for the safe contact.');
      return;
    }
    if (!currentUser && !getUserCookie()) {
      setStatus('❌ Restore your account first, then add contacts.');
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/contacts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ list: 'safe', name, phone }),
      });
      const data = await res.json();
      if (data.success) {
        saveContacts(data.safe || [], data.emergency || emergencyContacts);
        setSafePhone('');
        setSafeName('');
        if (form) form.reset();
        setStatus(`✅ Safe contact added: ${name}`);
      } else {
        setStatus('❌ ' + (data.error || 'Could not save safe contact.'));
      }
    } catch (err) {
      console.error(err);
      setStatus('❌ Could not save safe contact. Try again.');
    }
  };

  const removeSafeContact = async (index: number) => {
    const contact = safeContacts[index];
    if (!window.confirm(`Remove safe arrival contact "${contact.name} (${contact.phone})"?`)) return;
    try {
      const res = await fetch(`${API_BASE}/api/contacts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ list: 'safe', action: 'remove', index }),
      });
      const data = await res.json();
      if (data.success) {
        saveContacts(data.safe || [], data.emergency || emergencyContacts);
        setStatus('✅ Contact removed.');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const addEmergencyContact = async (e?: React.FormEvent<HTMLFormElement>) => {
    e?.preventDefault();
    const form = e?.currentTarget;
    const { phone, name } = form
      ? readContactFields(form, emergencyPhone, emergencyName)
      : { phone: emergencyPhone.trim(), name: emergencyName.trim() };

    if (!phone || !name) {
      setStatus('❌ Please enter both a phone number and a name for the emergency contact.');
      return;
    }
    if (!currentUser && !getUserCookie()) {
      setStatus('❌ Restore your account first, then add contacts.');
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/contacts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ list: 'emergency', name, phone }),
      });
      const data = await res.json();
      if (data.success) {
        saveContacts(data.safe || safeContacts, data.emergency || []);
        setEmergencyPhone('');
        setEmergencyName('');
        if (form) form.reset();
        setStatus(`✅ Emergency contact added: ${name}`);
      } else {
        setStatus('❌ ' + (data.error || 'Could not save emergency contact.'));
      }
    } catch (err) {
      console.error(err);
      setStatus('❌ Could not save emergency contact. Try again.');
    }
  };

  const removeEmergencyContact = async (index: number) => {
    const contact = emergencyContacts[index];
    if (!window.confirm(`Remove emergency contact "${contact.name} (${contact.phone})"?`)) return;
    try {
      const res = await fetch(`${API_BASE}/api/contacts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ list: 'emergency', action: 'remove', index }),
      });
      const data = await res.json();
      if (data.success) {
        saveContacts(data.safe || safeContacts, data.emergency || []);
        setStatus('✅ Contact removed.');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const sendSMSViaMessageMedia = async (
    recipientPhone: string,
    messageBody: string,
    alertType: string,
    lat: number | null,
    lng: number | null
  ): Promise<boolean> => {
    try {
      const res = await fetch(`${API_BASE}/api/send-sms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: recipientPhone,
          message: messageBody,
          userName: currentUser ? currentUser.name : 'Unknown User',
          userEmail: currentUser ? currentUser.email : '',
          alertType: alertType,
          lat,
          lng
        })
      });

      return res.ok;
    } catch (err) {
      console.error("Fetch exception:", err);
      return false;
    }
  };

  const sleep = (ms: number) =>
    new Promise<void>((resolve) => {
      setTimeout(resolve, ms);
    });

  const refreshCurrentUser = async () => {
    if (!currentUser) return;
    try {
      const res = await fetch(`${API_BASE}/api/users`);
      const data = await res.json();
      if (data.success) {
        const latest = data.users.find((u: UserProfile) =>
          emailsMatch(u.email, currentUser.email)
        );
        if (latest) {
          setCurrentUser(latest);
          localStorage.setItem('ozintel_current_user', JSON.stringify(latest));
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  /** Keep retrying every 5s until all contacts succeed (spotty regional reception). */
  const sendAlertWithRetry = async (
    contacts: Contact[],
    messageBody: string,
    alertType: 'SAFE ARRIVAL' | 'EMERGENCY',
    successMessage: string
  ) => {
    if (isSendingAlert) return;

    cancelSendRef.current = false;
    setIsSendingAlert(true);

    const label = alertType === 'SAFE ARRIVAL' ? 'Safe Arrival' : 'Emergency';
    setStatus(`Sending ${label} alert...`);

    const loc = await getAlertLocation();
    const lat = loc?.lat ?? null;
    const lng = loc?.lng ?? null;
    let pending = [...contacts];
    let attempt = 1;

    while (pending.length > 0) {
      if (cancelSendRef.current) {
        setStatus(`⏹ ${label} send cancelled. ${contacts.length - pending.length} of ${contacts.length} delivered.`);
        setIsSendingAlert(false);
        return;
      }

      setStatus(
        attempt === 1
          ? `Sending ${label} alert...`
          : `📶 Poor signal – retrying ${label} (attempt ${attempt})...`
      );

      const stillPending: Contact[] = [];
      for (const contact of pending) {
        if (cancelSendRef.current) break;
        const success = await sendSMSViaMessageMedia(
          contact.phone,
          messageBody,
          alertType,
          lat,
          lng
        );
        if (!success) stillPending.push(contact);
      }

      pending = stillPending;
      if (pending.length === 0) break;

      setStatus(
        `📶 No signal / send failed – retrying in 5 seconds... (${pending.length} contact${pending.length === 1 ? '' : 's'} left)`
      );
      await sleep(5000);
      attempt += 1;
    }

    if (cancelSendRef.current) {
      setIsSendingAlert(false);
      return;
    }

    setStatus(successMessage);
    await refreshCurrentUser();
    setIsSendingAlert(false);
  };

  const cancelAlertSend = () => {
    cancelSendRef.current = true;
    setStatus('⏹ Cancelling send...');
  };

  const sendSafeArrival = async (e?: React.FormEvent<HTMLFormElement>) => {
    // If React is alive, enhance with a short location attempt then JSON POST.
    // If this handler never runs, the native form POST to /api/alerts still works.
    e?.preventDefault();
    if (isSendingAlert) return;

    if (!currentUser || currentUser.status !== 'approved') {
      setStatus('❌ Restore an approved account before sending alerts.');
      return;
    }
    if (safeContacts.length === 0) {
      setStatus('❌ Add at least one Safe Arrival contact first.');
      return;
    }

    setIsSendingAlert(true);
    setStatus('Sending Safe Arrival alert...');
    try {
      const loc = await Promise.race([
        getAlertLocation(),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
      ]);
      const res = await fetch(`${API_BASE}/api/alerts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          type: 'safe',
          lat: loc?.lat ?? null,
          lng: loc?.lng ?? null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.success) {
        setStatus(
          alertStatusMessage(
            'safe-ok',
            String(data.sent || 1),
            data.failed ? String(data.failed) : null
          )
        );
        await refreshCurrentUser();
      } else {
        setStatus('❌ ' + (data.error || 'Could not send safe alert.'));
      }
    } catch (err) {
      console.error(err);
      // Last resort: native form submit without JS fetch
      if (e?.currentTarget) {
        e.currentTarget.submit();
        return;
      }
      setStatus('❌ Could not send safe alert. Try again.');
    } finally {
      setIsSendingAlert(false);
    }
  };

  const sendEmergencyAlert = async (e?: React.FormEvent<HTMLFormElement>) => {
    e?.preventDefault();
    if (isSendingAlert) return;

    if (!currentUser || currentUser.status !== 'approved') {
      setStatus('❌ Restore an approved account before sending alerts.');
      return;
    }
    if (emergencyContacts.length === 0) {
      setStatus('❌ Add at least one Emergency contact first.');
      return;
    }

    setIsSendingAlert(true);
    setStatus('Sending Emergency alert...');
    try {
      const loc = await Promise.race([
        getAlertLocation(),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
      ]);
      const res = await fetch(`${API_BASE}/api/alerts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          type: 'emergency',
          lat: loc?.lat ?? null,
          lng: loc?.lng ?? null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.success) {
        setStatus(
          alertStatusMessage(
            'emergency-ok',
            String(data.sent || 1),
            data.failed ? String(data.failed) : null
          )
        );
        await refreshCurrentUser();
      } else {
        setStatus('❌ ' + (data.error || 'Could not send emergency alert.'));
      }
    } catch (err) {
      console.error(err);
      if (e?.currentTarget) {
        e.currentTarget.submit();
        return;
      }
      setStatus('❌ Could not send emergency alert. Try again.');
    } finally {
      setIsSendingAlert(false);
    }
  };

  const pendingUsers = allUsers.filter(u => u.status === 'pending');
  const approvedUsersList = allUsers.filter(u => u.status === 'approved');
  const blockedUsersList = allUsers.filter(u => u.status === 'blocked');

  // Total SMS this month (all users)
  const totalSmsThisMonth = allUsers.reduce((sum, u) => sum + (u.smsCount || 0), 0);

  return (
    <div style={{ fontFamily: 'system-ui', background: '#0f172a', color: 'white', textAlign: 'center', padding: '20px', minHeight: '100vh' }}>
      
      <h1 style={{ color: '#22d3ee', margin: '10px 0', fontSize: '3.2rem', lineHeight: 1.1 }}>🛡️ OzIntel</h1>
      <p style={{ color: '#94a3b8', marginTop: 0, fontSize: '1.6rem', fontWeight: 500 }}>Alert System</p>

      {currentUser && (
        <div style={{ 
          background: currentUser.status === 'approved' ? '#14532d' : currentUser.status === 'blocked' ? '#450a0a' : '#78350f', 
          border: `1px solid ${currentUser.status === 'approved' ? '#22c55e' : currentUser.status === 'blocked' ? '#ef4444' : '#f59e0b'}`, 
          padding: '12px 20px', 
          borderRadius: '10px', 
          margin: '15px auto', 
          maxWidth: '400px' 
        }}>
          <p style={{ margin: 0, fontSize: '1rem' }}>
            Account: <strong>{currentUser.name}</strong> ({currentUser.email})<br />
            Status: <strong style={{ 
              color: currentUser.status === 'approved' ? '#4ade80' : currentUser.status === 'blocked' ? '#f87171' : '#fbbf24' 
            }}>
              {currentUser.status === 'approved' ? '✅ Approved' : 
               currentUser.status === 'blocked' ? '🚫 Blocked' : 
               '⏳ Pending Admin Approval'}
            </strong>
          </p>
        </div>
      )}

      <p
        role="status"
        style={{
          margin: '15px auto',
          fontSize: '1.15rem',
          minHeight: status ? '30px' : 0,
          color: '#22c55e',
          maxWidth: '420px',
          fontWeight: 600,
        }}
      >
        {status}
      </p>

      {showAdminLogin && !isAdminAuthenticated && (
        <form onSubmit={handleAdminLogin} style={{ background: '#1e2937', padding: '20px', borderRadius: '12px', margin: '15px auto', maxWidth: '400px', border: '1px solid #334155' }}>
          <h3 style={{ margin: '0 0 12px 0', color: '#f59e0b' }}>Admin Authentication</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <input type="email" placeholder="Admin Email" value={adminEmailInput} onChange={e => setAdminEmailInput(e.target.value)} style={{ padding: '10px', borderRadius: '6px', border: '1px solid #475569', background: '#0f172a', color: 'white' }} />
            <input type="password" placeholder="Admin Password" value={adminPassInput} onChange={e => setAdminPassInput(e.target.value)} style={{ padding: '10px', borderRadius: '6px', border: '1px solid #475569', background: '#0f172a', color: 'white' }} />
            <button type="submit" style={{ background: '#f59e0b', color: 'white', border: 'none', padding: '10px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>Login as Admin</button>
          </div>
        </form>
      )}

      {isAdminAuthenticated && (
        <div style={{ background: '#1e2937', border: '2px solid #f59e0b', padding: '20px', borderRadius: '12px', margin: '20px auto', maxWidth: '900px', textAlign: 'left' }}>
          <h2 style={{ color: '#f59e0b', marginTop: 0 }}>🛡️ Admin Control Panel</h2>

          {dataDirConfigured === false && (
            <div style={{ background: '#450a0a', border: '1px solid #ef4444', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px', color: '#fecaca' }}>
              <strong>Persistent storage is OFF.</strong> Render env <code>OZINTEL_DATA_DIR</code> is not set,
              so approved users are wiped on every redeploy. Add disk mount + set{" "}
              <code>OZINTEL_DATA_DIR=/var/data</code>, redeploy, then re-approve users once.
            </div>
          )}
          {dataDirConfigured === true && (
            <div style={{ background: '#14532d', border: '1px solid #22c55e', borderRadius: '8px', padding: '10px 16px', marginBottom: '16px', color: '#bbf7d0' }}>
              Persistent disk is configured — approved users should survive redeploys.
            </div>
          )}

          {/* Total SMS this month */}
          <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', padding: '12px 16px', marginBottom: '20px', textAlign: 'center' }}>
            <span style={{ color: '#94a3b8' }}>Total SMS sent this month (all users): </span>
            <strong style={{ color: '#22c55e', fontSize: '1.4rem' }}>{totalSmsThisMonth}</strong>
          </div>
          
          <div style={{ marginBottom: '25px', padding: '15px', background: '#0f172a', borderRadius: '8px', border: '1px solid #475569' }}>
            <h3 style={{ margin: '0 0 12px 0', color: '#38bdf8' }}>Manually Add User</h3>
            <form onSubmit={handleManualAddUser} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <input type="text" placeholder="Full Name" value={manualName} onChange={e => setManualName(e.target.value)} style={{ padding: '10px', borderRadius: '6px', border: '1px solid #475569', background: '#1e2937', color: 'white' }} />
              <input type="email" placeholder="Email" value={manualEmail} onChange={e => setManualEmail(e.target.value)} style={{ padding: '10px', borderRadius: '6px', border: '1px solid #475569', background: '#1e2937', color: 'white' }} />
              <input type="tel" placeholder="Phone" value={manualPhone} onChange={e => setManualPhone(e.target.value)} style={{ padding: '10px', borderRadius: '6px', border: '1px solid #475569', background: '#1e2937', color: 'white' }} />
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#94a3b8' }}>
                <input type="checkbox" checked={manualApproved} onChange={e => setManualApproved(e.target.checked)} />
                Approve immediately
              </label>
              <button type="submit" style={{ padding: '10px', background: '#22c55e', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>
                Add User
              </button>
            </form>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <h3 style={{ borderBottom: '1px solid #334155', paddingBottom: '6px' }}>Pending Approval ({pendingUsers.length})</h3>
            {pendingUsers.length === 0 ? <p style={{ color: '#94a3b8' }}>No pending user sign-ups.</p> : pendingUsers.map((u, i) => (
              <div key={i} style={{ background: '#334155', padding: '10px', borderRadius: '6px', margin: '8px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <strong>{u.name}</strong> ({u.email})<br />
                  <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>{u.phone} | SMS this month: {u.smsCount || 0}</span>
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button onClick={() => approveUser(u.email)} style={{ background: '#22c55e', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer' }}>Approve</button>
                  <button onClick={() => deleteUser(u.email)} style={{ background: '#ef4444', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer' }}>Delete</button>
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginBottom: '20px' }}>
            <h3 style={{ borderBottom: '1px solid #334155', paddingBottom: '6px' }}>Approved Users ({approvedUsersList.length})</h3>
            {approvedUsersList.length === 0 ? (
              <p style={{ color: '#94a3b8' }}>No approved users yet.</p>
            ) : (
              <div style={{ maxHeight: '450px', overflowY: 'auto', paddingRight: '6px' }}>
                {approvedUsersList.map((u, i) => (
                  <div key={i} style={{ background: '#334155', padding: '10px', borderRadius: '6px', margin: '8px 0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                      <div>
                        <strong>{u.name}</strong> ({u.email})<br />
                        <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
                          {u.phone} | <strong style={{ color: '#4ade80' }}>SMS this month: {u.smsCount || 0}</strong>
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        <button onClick={() => setSelectedEditUser(selectedEditUser?.email === u.email ? null : u)} style={{ background: '#0ea5e9', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer' }}>
                          {selectedEditUser?.email === u.email ? 'Close Edit' : 'Edit'}
                        </button>
                        <button onClick={() => blockUser(u.email)} style={{ background: '#f59e0b', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer' }}>
                          Block
                        </button>
                        <button onClick={() => deleteUser(u.email)} style={{ background: '#ef4444', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer' }}>
                          Delete
                        </button>
                      </div>
                    </div>

                    {selectedEditUser?.email === u.email && (
                      <div style={{ marginTop: '10px', padding: '10px', background: '#0f172a', borderRadius: '6px', border: '1px solid #475569' }}>
                        <p style={{ margin: '0 0 8px 0', fontSize: '0.9rem', color: '#38bdf8' }}>Component Permissions:</p>
                        <p style={{ margin: '0 0 8px 0', fontSize: '0.75rem', color: '#94a3b8' }}>
                          Each user only sees their own Accounting / Pub / Forestry data.
                        </p>
                        <label style={{ display: 'block', margin: '4px 0', cursor: 'pointer' }}>
                          <input type="checkbox" checked={u.permissions.accounting} onChange={e => updatePermissions(u.email, 'accounting', e.target.checked)} /> Accounting
                        </label>
                        <label style={{ display: 'block', margin: '4px 0', cursor: 'pointer' }}>
                          <input type="checkbox" checked={u.permissions.pubOps} onChange={e => updatePermissions(u.email, 'pubOps', e.target.checked)} /> Pub Ops
                        </label>
                        <label style={{ display: 'block', margin: '4px 0', cursor: 'pointer' }}>
                          <input type="checkbox" checked={u.permissions.forestryOps} onChange={e => updatePermissions(u.email, 'forestryOps', e.target.checked)} /> Forestry Ops
                        </label>
                        <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid #334155' }}>
                          <p style={{ margin: '0 0 6px 0', fontSize: '0.9rem', color: '#f97316' }}>
                            Share this user’s Pub Ops data with:
                          </p>
                          <p style={{ margin: '0 0 8px 0', fontSize: '0.75rem', color: '#94a3b8' }}>
                            Shared users open this keg counter (not their own empty one). Pub Ops permission is enabled automatically.
                          </p>
                          {approvedUsersList
                            .filter((other) => other.email.toLowerCase() !== u.email.toLowerCase())
                            .map((other) => {
                              const shared = (u.shares?.pubOps || []).some(
                                (e) => e.toLowerCase() === other.email.toLowerCase()
                              );
                              return (
                                <label
                                  key={other.email}
                                  style={{ display: 'block', margin: '4px 0', cursor: 'pointer', fontSize: '0.85rem' }}
                                >
                                  <input
                                    type="checkbox"
                                    checked={shared}
                                    onChange={(e) =>
                                      updatePubOpsShare(u.email, other.email, e.target.checked)
                                    }
                                  />{' '}
                                  {other.name} ({other.email})
                                </label>
                              );
                            })}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <h3 style={{ borderBottom: '1px solid #334155', paddingBottom: '6px' }}>Blocked Users ({blockedUsersList.length})</h3>
            {blockedUsersList.length === 0 ? (
              <p style={{ color: '#94a3b8' }}>No blocked users.</p>
            ) : (
              <div style={{ maxHeight: '300px', overflowY: 'auto', paddingRight: '6px' }}>
                {blockedUsersList.map((u, i) => (
                  <div key={i} style={{ background: '#450a0a', padding: '10px', borderRadius: '6px', margin: '8px 0', border: '1px solid #7f1d1d' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                      <div>
                        <strong>{u.name}</strong> ({u.email})<br />
                        <span style={{ fontSize: '0.85rem', color: '#fca5a5' }}>{u.phone} | SMS this month: {u.smsCount || 0}</span>
                      </div>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button onClick={() => approveUser(u.email)} style={{ background: '#22c55e', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer' }}>
                          Unblock
                        </button>
                        <button onClick={() => deleteUser(u.email)} style={{ background: '#ef4444', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer' }}>
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <form
        method="POST"
        action="/api/alerts"
        onSubmit={sendSafeArrival}
        style={{ margin: '15px auto', width: '90%', maxWidth: '400px' }}
      >
        <input type="hidden" name="type" value="safe" />
        <button
          type="submit"
          disabled={isSendingAlert}
          style={{
            padding: '20px',
            fontSize: '1.3rem',
            border: 'none',
            borderRadius: '12px',
            width: '100%',
            cursor: isSendingAlert ? 'not-allowed' : 'pointer',
            background: '#22c55e',
            color: 'white',
            fontWeight: 'bold',
            opacity: isSendingAlert ? 0.7 : 1,
            WebkitTapHighlightColor: 'rgba(34, 197, 94, 0.35)',
            touchAction: 'manipulation',
          }}
        >
          {isSendingAlert ? 'Sending…' : '✅ SAFE ARRIVAL'}
        </button>
      </form>
      <form
        method="POST"
        action="/api/alerts"
        onSubmit={sendEmergencyAlert}
        style={{ margin: '15px auto', width: '90%', maxWidth: '400px' }}
      >
        <input type="hidden" name="type" value="emergency" />
        <button
          type="submit"
          disabled={isSendingAlert}
          style={{
            padding: '20px',
            fontSize: '1.3rem',
            border: 'none',
            borderRadius: '12px',
            width: '100%',
            cursor: isSendingAlert ? 'not-allowed' : 'pointer',
            background: '#ef4444',
            color: 'white',
            fontWeight: 'bold',
            opacity: isSendingAlert ? 0.7 : 1,
            WebkitTapHighlightColor: 'rgba(239, 68, 68, 0.35)',
            touchAction: 'manipulation',
          }}
        >
          {isSendingAlert ? 'Sending…' : '🚨 SEND HELP'}
        </button>
      </form>
      {isSendingAlert && (
        <button
          type="button"
          onClick={cancelAlertSend}
          style={{
            padding: '12px',
            fontSize: '1rem',
            margin: '0 15px 10px 15px',
            border: '2px solid #f59e0b',
            borderRadius: '12px',
            width: '90%',
            maxWidth: '400px',
            cursor: 'pointer',
            background: 'rgba(245, 158, 11, 0.12)',
            color: '#f59e0b',
            fontWeight: 'bold',
            WebkitTapHighlightColor: 'rgba(245, 158, 11, 0.35)',
            touchAction: 'manipulation',
          }}
        >
          Cancel retry
        </button>
      )}
      <br />

      {/* Native <details> so Sign Up opens even if React hydration fails on iOS */}
      <details
        open={showSignUp}
        onToggle={(e) => {
          const open = (e.currentTarget as HTMLDetailsElement).open;
          setShowSignUp(open);
          if (open) setShowRestore(false);
        }}
        style={{
          margin: '10px auto 10px auto',
          width: '90%',
          maxWidth: '400px',
          textAlign: 'left',
        }}
      >
        <summary
          style={{
            listStyle: 'none',
            padding: '16px',
            fontSize: '1.1rem',
            border: '2px solid #0ea5e9',
            borderRadius: '12px',
            cursor: 'pointer',
            background: 'rgba(14, 165, 233, 0.12)',
            color: '#0ea5e9',
            fontWeight: 'bold',
            textAlign: 'center',
            WebkitTapHighlightColor: 'rgba(14, 165, 233, 0.35)',
            touchAction: 'manipulation',
          }}
        >
          {showSignUp ? 'Close Sign Up' : 'Sign Up - $11.00/month'}
        </summary>
        <form
          method="POST"
          action="/api/signup"
          onSubmit={handleSignUpSubmit}
          style={{
            background: '#1e2937',
            padding: '20px',
            borderRadius: '12px',
            margin: '12px 0 0 0',
            border: '1px solid #334155',
          }}
        >
          <h3 style={{ margin: '0 0 15px 0', color: '#38bdf8', textAlign: 'center' }}>
            New User Registration
          </h3>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              alignItems: 'center',
            }}
          >
            {/* Uncontrolled inputs so native POST works even if React state is stuck */}
            <input
              name="name"
              type="text"
              required
              autoComplete="name"
              placeholder="Full Name"
              defaultValue={signUpName}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '8px',
                border: '1px solid #475569',
                background: '#0f172a',
                color: 'white',
              }}
            />
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="Email Address"
              defaultValue={signUpEmail}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '8px',
                border: '1px solid #475569',
                background: '#0f172a',
                color: 'white',
              }}
            />
            <input
              name="phone"
              type="tel"
              required
              autoComplete="tel"
              inputMode="tel"
              placeholder="+61412345678"
              defaultValue={signUpPhone}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '8px',
                border: '1px solid #475569',
                background: '#0f172a',
                color: 'white',
              }}
            />
            <button
              type="submit"
              disabled={signupBusy}
              style={{
                padding: '12px 20px',
                width: '100%',
                fontSize: '1rem',
                background: signupBusy ? '#64748b' : '#22c55e',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: signupBusy ? 'wait' : 'pointer',
                fontWeight: 'bold',
                WebkitTapHighlightColor: 'rgba(34, 197, 94, 0.35)',
                touchAction: 'manipulation',
              }}
            >
              {signupBusy ? 'Submitting…' : 'Submit Registration'}
            </button>
            {status ? (
              <p
                role="status"
                style={{
                  margin: '4px 0 0 0',
                  color: '#22c55e',
                  fontSize: '1rem',
                  textAlign: 'center',
                  width: '100%',
                }}
              >
                {status}
              </p>
            ) : null}
          </div>
        </form>
      </details>

      <details
        open={showRestore}
        onToggle={(e) => {
          const open = (e.currentTarget as HTMLDetailsElement).open;
          setShowRestore(open);
          if (open) setShowSignUp(false);
        }}
        style={{
          margin: '0 auto 25px auto',
          width: '90%',
          maxWidth: '400px',
          textAlign: 'left',
        }}
      >
        <summary
          style={{
            listStyle: 'none',
            padding: '12px',
            fontSize: '1rem',
            border: '2px solid #94a3b8',
            borderRadius: '12px',
            cursor: 'pointer',
            background: 'rgba(148, 163, 184, 0.12)',
            color: '#94a3b8',
            fontWeight: 'bold',
            textAlign: 'center',
            WebkitTapHighlightColor: 'rgba(148, 163, 184, 0.35)',
            touchAction: 'manipulation',
          }}
        >
          {showRestore ? 'Close Restore' : 'Restore My Account'}
        </summary>
        <form
          method="POST"
          action="/api/users/restore"
          onSubmit={handleRestoreAccount}
          style={{
            background: '#1e2937',
            padding: '20px',
            borderRadius: '12px',
            margin: '12px 0 0 0',
            border: '1px solid #334155',
          }}
        >
          <h3 style={{ margin: '0 0 15px 0', color: '#94a3b8', textAlign: 'center' }}>
            Restore Existing Account
          </h3>
          <p
            style={{
              fontSize: '0.9rem',
              color: '#94a3b8',
              marginTop: 0,
              textAlign: 'center',
            }}
          >
            Enter the <strong>signup email</strong>, mobile, or exact full name.
            Use the address stored in Admin (it may not look like their name).
          </p>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              alignItems: 'center',
            }}
          >
            <input
              name="restore"
              type="text"
              required
              placeholder="Email, phone, or full name"
              defaultValue={restoreEmail}
              autoComplete="username"
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '8px',
                border: '1px solid #475569',
                background: '#0f172a',
                color: 'white',
              }}
            />
            <button
              type="submit"
              style={{
                padding: '12px 20px',
                width: '100%',
                fontSize: '1rem',
                background: '#64748b',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 'bold',
                WebkitTapHighlightColor: 'rgba(100, 116, 139, 0.35)',
                touchAction: 'manipulation',
              }}
            >
              Restore Account
            </button>
          </div>
        </form>
      </details>

      <div style={{ background: '#1e2937', padding: '12px 20px', borderRadius: '10px', margin: '15px auto', maxWidth: '300px', fontSize: '1.1rem', color: '#cbd5e1' }}>
        SMS Sent this month: <strong style={{ color: '#22c55e', fontSize: '1.3rem' }}>{currentUser ? (currentUser.smsCount || 0) : 0}</strong>
      </div>

      <div style={{ margin: '30px 0', borderTop: '1px solid #334155', paddingTop: '20px' }}>
        <h2>Safe Arrival Contacts</h2>
        <p style={{ color: '#94a3b8', fontSize: '0.9rem', margin: '0 auto 8px', maxWidth: '400px' }}>
          Saved to your OzIntel account (works after Restore).
        </p>
        {safeContacts.map((contact, index) => (
          <div key={`${contact.phone}-${index}`} style={{ background: '#334155', padding: '12px', margin: '10px auto', borderRadius: '8px', maxWidth: '400px', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <span>{contact.name} ({contact.phone})</span>
            <form method="POST" action="/api/contacts" onSubmit={(e) => { e.preventDefault(); void removeSafeContact(index); }} style={{ margin: 0 }}>
              <input type="hidden" name="list" value="safe" />
              <input type="hidden" name="action" value="remove" />
              <input type="hidden" name="index" value={String(index)} />
              <button type="submit" style={{ background: '#dc3545', color: 'white', padding: '6px 12px', fontSize: '0.9rem', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>Remove</button>
            </form>
          </div>
        ))}
        <form
          method="POST"
          action="/api/contacts"
          onSubmit={addSafeContact}
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', marginTop: '15px' }}
        >
          <input type="hidden" name="list" value="safe" />
          <input
            name="phone"
            type="tel"
            required
            inputMode="tel"
            autoComplete="tel"
            placeholder="+61412345678"
            defaultValue=""
            style={{ width: '90%', maxWidth: '400px', padding: '14px', borderRadius: '8px', border: '1px solid #475569', background: '#1e2937', color: 'white' }}
          />
          <input
            name="name"
            type="text"
            required
            autoComplete="name"
            placeholder="Name"
            defaultValue=""
            style={{ width: '90%', maxWidth: '400px', padding: '14px', borderRadius: '8px', border: '1px solid #475569', background: '#1e2937', color: 'white' }}
          />
          <button type="submit" style={{ padding: '12px 20px', fontSize: '1rem', background: '#0ea5e9', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', WebkitTapHighlightColor: 'rgba(14,165,233,0.35)', touchAction: 'manipulation' }}>
            Add Safe
          </button>
        </form>
      </div>

      <div style={{ margin: '30px 0', borderTop: '1px solid #334155', paddingTop: '20px' }}>
        <h2>Emergency Contacts</h2>
        <p style={{ color: '#94a3b8', fontSize: '0.9rem', margin: '0 auto 8px', maxWidth: '400px' }}>
          Saved to your OzIntel account (works after Restore).
        </p>
        {emergencyContacts.map((contact, index) => (
          <div key={`${contact.phone}-${index}`} style={{ background: '#334155', padding: '12px', margin: '10px auto', borderRadius: '8px', maxWidth: '400px', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <span>{contact.name} ({contact.phone})</span>
            <form method="POST" action="/api/contacts" onSubmit={(e) => { e.preventDefault(); void removeEmergencyContact(index); }} style={{ margin: 0 }}>
              <input type="hidden" name="list" value="emergency" />
              <input type="hidden" name="action" value="remove" />
              <input type="hidden" name="index" value={String(index)} />
              <button type="submit" style={{ background: '#dc3545', color: 'white', padding: '6px 12px', fontSize: '0.9rem', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>Remove</button>
            </form>
          </div>
        ))}
        <form
          method="POST"
          action="/api/contacts"
          onSubmit={addEmergencyContact}
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', marginTop: '15px' }}
        >
          <input type="hidden" name="list" value="emergency" />
          <input
            name="phone"
            type="tel"
            required
            inputMode="tel"
            autoComplete="tel"
            placeholder="+61412345678"
            defaultValue=""
            style={{ width: '90%', maxWidth: '400px', padding: '14px', borderRadius: '8px', border: '1px solid #475569', background: '#1e2937', color: 'white' }}
          />
          <input
            name="name"
            type="text"
            required
            autoComplete="name"
            placeholder="Name"
            defaultValue=""
            style={{ width: '90%', maxWidth: '400px', padding: '14px', borderRadius: '8px', border: '1px solid #475569', background: '#1e2937', color: 'white' }}
          />
          <button type="submit" style={{ padding: '12px 20px', fontSize: '1rem', background: '#0ea5e9', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', WebkitTapHighlightColor: 'rgba(14,165,233,0.35)', touchAction: 'manipulation' }}>
            Add Emergency
          </button>
        </form>
      </div>

      <div style={{ margin: '40px 0 20px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px' }}>
        <VoiceNavBar variant="home" />
        <a href="/accounting" style={{ padding: '20px', fontSize: '1.3rem', border: 'none', borderRadius: '12px', width: '90%', maxWidth: '400px', cursor: 'pointer', background: '#f97316', color: 'white', fontWeight: 'bold', textDecoration: 'none', boxSizing: 'border-box', textAlign: 'center' }}>
          Accounting
        </a>
        <a href="/operations/pub" style={{ padding: '20px', fontSize: '1.3rem', border: 'none', borderRadius: '12px', width: '90%', maxWidth: '400px', cursor: 'pointer', background: '#1d4ed8', color: 'white', fontWeight: 'bold', textDecoration: 'none', boxSizing: 'border-box', textAlign: 'center' }}>
          Pub Operations
        </a>
        <a href="/operations/forestry" style={{ padding: '20px', fontSize: '1.3rem', border: 'none', borderRadius: '12px', width: '90%', maxWidth: '400px', cursor: 'pointer', background: '#15803d', color: 'white', fontWeight: 'bold', textDecoration: 'none', boxSizing: 'border-box', textAlign: 'center' }}>
          Forestry Operations
        </a>
      </div>

      <div style={{ marginTop: '40px', paddingBottom: '30px', display: 'flex', justifyContent: 'center' }}>
        <button
          type="button"
          onClick={() => setShowAdminLogin(!showAdminLogin)}
          style={{
            background: '#334155',
            color: '#cbd5e1',
            border: 'none',
            padding: '8px 14px',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '0.9rem',
            WebkitTapHighlightColor: 'rgba(148, 163, 184, 0.35)',
            touchAction: 'manipulation',
          }}
        >
          {isAdminAuthenticated ? '🔒 Admin Active' : 'Admin Login'}
        </button>
      </div>
    </div>
  );
}
