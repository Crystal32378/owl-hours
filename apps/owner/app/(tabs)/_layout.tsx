import { useCallback, useEffect, useState } from "react";
import { Tabs } from "expo-router";
import { TABS, TabBar } from "../../shared/shell/TabBar";
import { NO_BADGES, tabBadgeCounts } from "../../shared/shell/tabBadges";
import type { TabBadges } from "../../shared/shell/tabBadges";
import { createRequestsRuntime } from "../../features/requests/hooks/requestsRuntime";
import { defaultConversationsService } from "../../features/chats/hooks/defaultConversationsService";

// Expo Router 58 renders only the screens a layout declares, so every tab is declared here.
// The badges refresh whenever a tab gains focus, so an answered request or a read chat clears them.
export default function TabsLayout() {
  const { badges, refresh } = useTabBadges();

  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      screenListeners={{ focus: refresh }}
      tabBar={(props) => <TabBar {...props} badges={badges} />}
    >
      {TABS.map((tab) => (
        <Tabs.Screen key={tab.name} name={tab.name} options={{ title: tab.label }} />
      ))}
    </Tabs>
  );
}

// The same services the Requests and Chats tabs read: the API in live mode, the demo otherwise.
// A failed count keeps the last badges rather than inventing new ones.
function useTabBadges(): { badges: TabBadges; refresh: () => void } {
  const [badges, setBadges] = useState(NO_BADGES);
  const [refreshToken, setRefreshToken] = useState(0);
  const refresh = useCallback(() => setRefreshToken((token) => token + 1), []);

  useEffect(() => {
    let isCurrent = true;
    Promise.all([createRequestsRuntime().service.listOffers(), defaultConversationsService().getConversations()]).then(
      ([offers, conversations]) => {
        if (isCurrent) setBadges(tabBadgeCounts(offers, conversations));
      },
      () => {},
    );
    return () => {
      isCurrent = false;
    };
  }, [refreshToken]);

  return { badges, refresh };
}
