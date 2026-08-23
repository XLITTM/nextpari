import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { supabase } from './lib/supabase';
import type { PersonalData } from './types';

const EMPTY_DATA: PersonalData = {
  first_name: '',
  last_name: '',
  middle_name: '',
  birth_date: '',
  phone: '',
  phone_verified: false,
  email: '',
  email_verified: false,
  passport: '',
};

interface ProfileContextValue {
  personalData: PersonalData;
  loading: boolean;
  isProfileComplete: boolean;
  refresh: () => Promise<void>;
}

const ProfileContext = createContext<ProfileContextValue | null>(null);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [personalData, setPersonalData] = useState<PersonalData>(EMPTY_DATA);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const { data } = await supabase
      .from('personal_data')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) {
      setPersonalData(data as PersonalData);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const isProfileComplete = Boolean(
    personalData.last_name &&
    personalData.first_name &&
    personalData.middle_name &&
    personalData.birth_date &&
    personalData.phone &&
    personalData.phone_verified &&
    personalData.email &&
    personalData.email_verified &&
    personalData.passport
  );

  return (
    <ProfileContext.Provider value={{ personalData, loading, isProfileComplete, refresh }}>
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error('useProfile must be used within ProfileProvider');
  return ctx;
}
