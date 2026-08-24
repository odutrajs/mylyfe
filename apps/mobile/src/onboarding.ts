import { useEffect, useState } from "react";
import * as SecureStore from "expo-secure-store";

const onboardingKey = "zelo-onboarding-seen";

export function useOnboardingSeen() {
  const [ready, setReady] = useState(false);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    let active = true;
    void SecureStore.getItemAsync(onboardingKey).then((value) => {
      if (!active) return;
      setSeen(value === "1");
      setReady(true);
    });
    return () => {
      active = false;
    };
  }, []);

  const markSeen = async () => {
    await SecureStore.setItemAsync(onboardingKey, "1");
    setSeen(true);
  };

  return { ready, seen, markSeen };
}
