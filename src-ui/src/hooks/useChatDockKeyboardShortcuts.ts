import { useCallback } from 'react';
import {
  useActiveChatActions,
  useCancelMessage,
} from '../contexts/ActiveChatsContext';
import { useNavigation } from '../contexts/NavigationContext';
import { useKeyboardShortcut } from './useKeyboardShortcut';

interface DerivedSession {
  id: string;
  abortController?: AbortController;
}

interface UseChatDockKeyboardShortcutsOptions {
  sessions: DerivedSession[];
  activeSessionId: string | null;
  activeSession: DerivedSession | null;
  dockHeight: number;
  previousDockHeight: number;
  previousDockOpen: boolean;
  setDockHeight: (h: number) => void;
  setPreviousDockHeight: (h: number) => void;
  setPreviousDockOpen: (o: boolean) => void;
  setActiveSessionId: (id: string | null) => void;
  setShowSessionPicker: (v: boolean) => void;
  focusSession: (id: string) => void;
}

export function useChatDockKeyboardShortcuts({
  sessions,
  activeSessionId,
  activeSession,
  dockHeight,
  previousDockHeight,
  previousDockOpen,
  setDockHeight,
  setPreviousDockHeight,
  setPreviousDockOpen,
  setActiveSessionId,
  setShowSessionPicker,
  focusSession,
}: UseChatDockKeyboardShortcutsOptions) {
  const {
    selectedAgent,
    isDockOpen,
    isDockMaximized,
    setDockState,
    setActiveChat,
  } = useNavigation();
  const { initChat, removeChat, addEphemeralMessage } = useActiveChatActions();
  const cancelMessage = useCancelMessage();

  useKeyboardShortcut(
    'dock.toggle',
    'd',
    ['cmd'],
    'Toggle dock',
    useCallback(() => {
      setDockState(!isDockOpen, isDockOpen ? false : isDockMaximized);
    }, [isDockOpen, isDockMaximized, setDockState]),
  );

  useKeyboardShortcut(
    'dock.maximize',
    'm',
    ['cmd'],
    'Maximize/restore dock',
    useCallback(() => {
      if (isDockMaximized) {
        setDockHeight(previousDockHeight);
        setDockState(previousDockOpen, false);
      } else {
        const toolbarHeight = parseInt(
          getComputedStyle(document.documentElement).getPropertyValue(
            '--app-toolbar-height',
          ),
          10,
        );
        setPreviousDockHeight(dockHeight);
        setPreviousDockOpen(isDockOpen);
        setDockHeight(window.innerHeight - toolbarHeight);
        setDockState(true, true);
      }
    }, [
      isDockMaximized,
      dockHeight,
      isDockOpen,
      previousDockHeight,
      previousDockOpen,
      setDockState,
      setDockHeight,
      setPreviousDockHeight,
      setPreviousDockOpen,
    ]),
  );

  useKeyboardShortcut(
    'dock.newChat',
    't',
    ['cmd'],
    'New chat',
    useCallback(() => {
      if (selectedAgent) {
        const newSessionId = `session-${Date.now()}`;
        initChat(newSessionId, (selectedAgent as any) ?? undefined);
        setActiveSessionId(newSessionId);
        setActiveChat(null); // New chat, no conversation yet
      }
    }, [selectedAgent, initChat, setActiveSessionId, setActiveChat]),
  );

  useKeyboardShortcut(
    'dock.openConversation',
    'o',
    ['cmd'],
    'Open conversation',
    useCallback(() => {
      setShowSessionPicker(true);
    }, [setShowSessionPicker]),
  );

  useKeyboardShortcut(
    'dock.closeTab',
    'x',
    ['cmd'],
    'Close tab',
    useCallback(() => {
      if (activeSessionId && sessions.length > 1) {
        const currentIndex = sessions.findIndex(
          (s) => s.id === activeSessionId,
        );
        const nextSession =
          sessions[currentIndex + 1] || sessions[currentIndex - 1];
        if (nextSession) focusSession(nextSession.id);
        removeChat(activeSessionId);
      }
    }, [activeSessionId, sessions, focusSession, removeChat]),
  );

  // Session switching shortcuts (⌘1-9)
  useKeyboardShortcut(
    'dock.session1',
    '1',
    ['cmd'],
    'Switch to session 1',
    useCallback(() => {
      if (sessions[0]) focusSession(sessions[0].id);
    }, [sessions, focusSession]),
  );
  useKeyboardShortcut(
    'dock.session2',
    '2',
    ['cmd'],
    'Switch to session 2',
    useCallback(() => {
      if (sessions[1]) focusSession(sessions[1].id);
    }, [sessions, focusSession]),
  );
  useKeyboardShortcut(
    'dock.session3',
    '3',
    ['cmd'],
    'Switch to session 3',
    useCallback(() => {
      if (sessions[2]) focusSession(sessions[2].id);
    }, [sessions, focusSession]),
  );
  useKeyboardShortcut(
    'dock.session4',
    '4',
    ['cmd'],
    'Switch to session 4',
    useCallback(() => {
      if (sessions[3]) focusSession(sessions[3].id);
    }, [sessions, focusSession]),
  );
  useKeyboardShortcut(
    'dock.session5',
    '5',
    ['cmd'],
    'Switch to session 5',
    useCallback(() => {
      if (sessions[4]) focusSession(sessions[4].id);
    }, [sessions, focusSession]),
  );
  useKeyboardShortcut(
    'dock.session6',
    '6',
    ['cmd'],
    'Switch to session 6',
    useCallback(() => {
      if (sessions[5]) focusSession(sessions[5].id);
    }, [sessions, focusSession]),
  );
  useKeyboardShortcut(
    'dock.session7',
    '7',
    ['cmd'],
    'Switch to session 7',
    useCallback(() => {
      if (sessions[6]) focusSession(sessions[6].id);
    }, [sessions, focusSession]),
  );
  useKeyboardShortcut(
    'dock.session8',
    '8',
    ['cmd'],
    'Switch to session 8',
    useCallback(() => {
      if (sessions[7]) focusSession(sessions[7].id);
    }, [sessions, focusSession]),
  );
  useKeyboardShortcut(
    'dock.session9',
    '9',
    ['cmd'],
    'Switch to session 9',
    useCallback(() => {
      if (sessions[8]) focusSession(sessions[8].id);
    }, [sessions, focusSession]),
  );

  useKeyboardShortcut(
    'dock.cancel',
    'c',
    ['ctrl'],
    'Cancel request',
    useCallback(() => {
      if (activeSession?.abortController) {
        cancelMessage(activeSession.id);
        addEphemeralMessage(activeSession.id, {
          role: 'system',
          content: 'User canceled the ongoing request.',
        });
      }
    }, [activeSession, cancelMessage, addEphemeralMessage]),
  );
}
