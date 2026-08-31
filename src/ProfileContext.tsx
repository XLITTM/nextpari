import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { PersonalData } from './types';
import {
  EMPTY_PLAYER_PROFILE,
  fetchPlayerProfile,
  isPlayerProfileComplete,
  personalDataFromProfile,
  savePlayerProfile,
  type PlayerProfileSnapshot,
} from './lib/playerAuth';

const EMPTY_DATA: PersonalData = personalDataFromProfile(EMPTY_PLAYER_PROFILE);

interface ProfileContextValue {
  personalData: PersonalData;
  loading: boolean;
  isProfileComplete: boolean;
  refresh: () => Promise<void>;
  save: (input: {
    firstName: string;
    lastName: string;
    middleName: string;
    birthDate: string;
    passport: string;
  }) => Promise<PersonalData>;
  reset: () => void;
}

const ProfileContext = createContext<ProfileContextValue | null>(null);

function applyProfile(profile: PlayerProfileSnapshot | null): PersonalData {
  return personalDataFromProfile(profile ?? EMPTY_PLAYER_PROFILE);
}

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [personalData, setPersonalData] = useState<PersonalData>(EMPTY_DATA);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const profile = await fetchPlayerProfile();
      setPersonalData(applyProfile(profile));
    } catch {
      setPersonalData(EMPTY_DATA);
    } finally {
      setLoading(false);
    }
  }, []);

  const save = useCallback(async (input: {
    firstName: string;
    lastName: string;
    middleName: string;
    birthDate: string;
    passport: string;
  }) => {
    const profile = await savePlayerProfile(input);
    const next = applyProfile(profile);
    setPersonalData(next);
    return next;
  }, []);

  const reset = useCallback(() => {
    setPersonalData(EMPTY_DATA);
  }, []);

  const isProfileComplete = isPlayerProfileComplete({
    firstName: personalData.first_name,
    lastName: personalData.last_name,
    middleName: personalData.middle_name,
    birthDate: personalData.birth_date,
    passport: personalData.passport,
    phone: personalData.phone,
    email: personalData.email,
    phoneVerified: personalData.phone_verified,
    emailVerified: personalData.email_verified,
  });

  return (
    <ProfileContext.Provider value={{ personalData, loading, isProfileComplete, refresh, save, reset }}>
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error('useProfile must be used within ProfileProvider');
  return ctx;
}
