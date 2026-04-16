/**
 * TutorPanel — companion app tutor chat sheet.
 *
 * Floats as a small "Ask Sketch" pill on the live page.
 * Tapping it opens a bottom-sheet modal with the Sketch AI tutor.
 * TTS is handled by expo-speech so the tutor speaks to the student.
 * SSE streaming is done via XMLHttpRequest (no native EventSource in RN).
 */

import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Speech from 'expo-speech';

import { colors, radius, space } from '../theme';

// ─── Types ────────────────────────────────────────────────────────────────────

type Message = {
  id: string;
  role: 'tutor' | 'student';
  content: string;
  isStreaming?: boolean;
};

export type TutorPanelProps = {
  backendUrl: string;
  studentName?: string;
  conceptId?: string;
  ageGroup?: 'explorer' | 'builder' | 'engineer';
};

// ─── Helper ───────────────────────────────────────────────────────────────────

/** Strip markdown formatting before passing to TTS. */
function cleanForSpeech(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/#{1,6} /g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .trim();
}

// ─── Component ────────────────────────────────────────────────────────────────

export function TutorPanel({
  backendUrl,
  studentName = 'Student',
  conceptId = 'free-draw',
  ageGroup = 'builder',
}: TutorPanelProps) {
  const [visible, setVisible] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(true);

  const scrollRef = useRef<ScrollView>(null);
  const lastSpokenRef = useRef<string>('');
  const greeted = useRef(false);

  // ── SSE streaming via XHR ─────────────────────────────────────────────────

  const streamMessage = useCallback(
    (trigger: string, studentMessage = '') => {
      if (streaming) return;
      setStreaming(true);

      const msgId = `t-${Date.now()}`;

      setMessages((prev) => [
        ...prev,
        { id: msgId, role: 'tutor', content: '', isStreaming: true },
      ]);

      const body = JSON.stringify({
        student_name: studentName,
        age_group: ageGroup,
        trigger,
        concept_id: conceptId,
        layer: 'intuitive',
        student_message: studentMessage,
        drawing_prompt: '',
        path_count: 0,
      });

      const xhr = new XMLHttpRequest();
      let offset = 0;
      let accumulated = '';

      xhr.open('POST', `${backendUrl}/api/tutor/message`, true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.setRequestHeader('Accept', 'text/event-stream');

      xhr.onprogress = () => {
        const newData = xhr.responseText.slice(offset);
        offset = xhr.responseText.length;

        for (const line of newData.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;
          try {
            const event = JSON.parse(raw) as { type: string; text?: string };
            if (event.type === 'token' && event.text) {
              accumulated += event.text;
              const snap = accumulated;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === msgId ? { ...m, content: snap } : m,
                ),
              );
              scrollRef.current?.scrollToEnd({ animated: false });
            }
          } catch {
            // Malformed event line — skip.
          }
        }
      };

      xhr.onloadend = () => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msgId ? { ...m, isStreaming: false } : m,
          ),
        );
        setStreaming(false);

        if (ttsEnabled && accumulated && accumulated !== lastSpokenRef.current) {
          lastSpokenRef.current = accumulated;
          const clean = cleanForSpeech(accumulated);
          const rate =
            ageGroup === 'explorer' ? 0.85 : ageGroup === 'engineer' ? 1.0 : 0.92;
          const pitch = ageGroup === 'explorer' ? 1.2 : 1.0;
          Speech.speak(clean, { language: 'en-US', rate, pitch });
        }
      };

      xhr.onerror = () => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msgId
              ? {
                  ...m,
                  content:
                    "I'm having trouble connecting right now. Make sure the robot is on the same Wi-Fi!",
                  isStreaming: false,
                }
              : m,
          ),
        );
        setStreaming(false);
      };

      xhr.send(body);
    },
    [backendUrl, studentName, ageGroup, conceptId, streaming, ttsEnabled],
  );

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleOpen = useCallback(() => {
    setVisible(true);
    if (!greeted.current) {
      greeted.current = true;
      // Slight delay so the sheet animation finishes before we start streaming
      setTimeout(() => streamMessage('concept_change'), 300);
    }
  }, [streamMessage]);

  const handleClose = useCallback(() => {
    setVisible(false);
    Speech.stop();
  }, []);

  const handleSend = useCallback(() => {
    const text = inputText.trim();
    if (!text || streaming) return;
    setMessages((prev) => [
      ...prev,
      { id: `s-${Date.now()}`, role: 'student', content: text },
    ]);
    setInputText('');
    streamMessage('student_reply', text);
  }, [inputText, streaming, streamMessage]);

  const toggleTts = useCallback(() => {
    const next = !ttsEnabled;
    setTtsEnabled(next);
    if (!next) Speech.stop();
  }, [ttsEnabled]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Floating trigger pill */}
      <Pressable style={styles.floatBtn} onPress={handleOpen}>
        <Text style={styles.floatBtnEmoji}>🤖</Text>
        <Text style={styles.floatBtnLabel}>Ask Sketch</Text>
      </Pressable>

      <Modal
        visible={visible}
        animationType="slide"
        transparent
        onRequestClose={handleClose}
        statusBarTranslucent
      >
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            {/* Drag handle */}
            <View style={styles.handle} />

            {/* Header */}
            <View style={styles.header}>
              <View style={styles.avatarWrap}>
                <Text style={styles.avatarEmoji}>🤖</Text>
              </View>
              <View style={styles.headerMeta}>
                <Text style={styles.headerName}>Sketch</Text>
                <Text style={styles.headerSub}>
                  {streaming ? 'thinking...' : 'Your robot tutor'}
                </Text>
              </View>
              <View style={styles.headerActions}>
                <Pressable style={styles.iconBtn} onPress={toggleTts}>
                  <Text style={styles.iconBtnText}>
                    {ttsEnabled ? '🔊' : '🔇'}
                  </Text>
                </Pressable>
                <Pressable style={styles.doneBtn} onPress={handleClose}>
                  <Text style={styles.doneBtnText}>Done</Text>
                </Pressable>
              </View>
            </View>

            {/* Message list */}
            <ScrollView
              ref={scrollRef}
              style={styles.msgList}
              contentContainerStyle={styles.msgListContent}
              keyboardShouldPersistTaps="handled"
              onContentSizeChange={() =>
                scrollRef.current?.scrollToEnd({ animated: true })
              }
            >
              {messages.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyStateEmoji}>✨</Text>
                  <Text style={styles.emptyStateText}>
                    Sketch is getting ready to chat with you...
                  </Text>
                </View>
              ) : (
                messages.map((msg) => (
                  <View
                    key={msg.id}
                    style={[
                      styles.bubble,
                      msg.role === 'student'
                        ? styles.bubbleStudent
                        : styles.bubbleTutor,
                    ]}
                  >
                    <Text
                      style={[
                        styles.bubbleText,
                        msg.role === 'student'
                          ? styles.bubbleTextStudent
                          : styles.bubbleTextTutor,
                      ]}
                    >
                      {msg.content || (msg.isStreaming ? '' : '…')}
                      {msg.isStreaming ? (
                        <Text style={styles.cursor}>▌</Text>
                      ) : null}
                    </Text>
                  </View>
                ))
              )}
            </ScrollView>

            {/* Input row */}
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.input}
                  value={inputText}
                  onChangeText={setInputText}
                  placeholder="Ask Sketch anything..."
                  placeholderTextColor={colors.muted2}
                  multiline
                  maxLength={300}
                  returnKeyType="send"
                  blurOnSubmit={false}
                  onSubmitEditing={handleSend}
                  editable={!streaming}
                />
                <Pressable
                  style={[
                    styles.sendBtn,
                    streaming || !inputText.trim()
                      ? styles.sendBtnDisabled
                      : null,
                  ]}
                  onPress={handleSend}
                  disabled={streaming || !inputText.trim()}
                >
                  {streaming ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.sendBtnText}>↑</Text>
                  )}
                </Pressable>
              </View>
            </KeyboardAvoidingView>
          </View>
        </View>
      </Modal>
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Floating trigger
  floatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(123, 224, 255, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(123, 224, 255, 0.35)',
    shadowColor: '#7be0ff',
    shadowOpacity: 0.22,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
  },
  floatBtnEmoji: {
    fontSize: 18,
  },
  floatBtnLabel: {
    color: colors.cyan,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.4,
  },

  // Modal backdrop
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(5, 8, 22, 0.72)',
  },

  // Bottom sheet
  sheet: {
    backgroundColor: colors.panel,
    borderTopLeftRadius: radius['2xl'],
    borderTopRightRadius: radius['2xl'],
    borderWidth: 1,
    borderColor: 'rgba(123, 224, 255, 0.14)',
    borderBottomWidth: 0,
    maxHeight: '80%',
    paddingBottom: Platform.OS === 'ios' ? 28 : 12,
    overflow: 'hidden',
  },

  // Drag handle
  handle: {
    width: 38,
    height: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 8,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    paddingHorizontal: space[4],
    paddingVertical: space[3],
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(123, 224, 255, 0.1)',
  },
  avatarWrap: {
    width: 40,
    height: 40,
    borderRadius: 999,
    backgroundColor: 'rgba(123, 224, 255, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(123, 224, 255, 0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEmoji: {
    fontSize: 20,
  },
  headerMeta: {
    flex: 1,
    gap: 2,
  },
  headerName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  headerSub: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '600',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnText: {
    fontSize: 18,
  },
  doneBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(123, 224, 255, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(123, 224, 255, 0.28)',
  },
  doneBtnText: {
    color: colors.cyan,
    fontSize: 13,
    fontWeight: '800',
  },

  // Messages
  msgList: {
    flex: 1,
    minHeight: 180,
  },
  msgListContent: {
    padding: space[4],
    gap: space[3],
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingVertical: space[8],
    gap: space[3],
  },
  emptyStateEmoji: {
    fontSize: 32,
  },
  emptyStateText: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    maxWidth: '70%',
    lineHeight: 20,
  },

  // Bubbles
  bubble: {
    maxWidth: '82%',
    borderRadius: radius.md,
    paddingHorizontal: space[4],
    paddingVertical: space[3],
  },
  bubbleTutor: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(123, 224, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(123, 224, 255, 0.2)',
  },
  bubbleStudent: {
    alignSelf: 'flex-end',
    backgroundColor: 'rgba(107, 124, 255, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(107, 124, 255, 0.3)',
  },
  bubbleText: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '600',
  },
  bubbleTextTutor: {
    color: colors.text,
  },
  bubbleTextStudent: {
    color: colors.text,
  },
  cursor: {
    color: colors.cyan,
    opacity: 0.7,
  },

  // Input row
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: space[2],
    paddingHorizontal: space[4],
    paddingTop: space[3],
    paddingBottom: space[2],
    borderTopWidth: 1,
    borderTopColor: 'rgba(123, 224, 255, 0.1)',
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 100,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(123, 224, 255, 0.18)',
    color: colors.text,
    paddingHorizontal: space[3],
    paddingVertical: 10,
    fontSize: 15,
    fontWeight: '600',
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 999,
    backgroundColor: colors.cyan,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.cyan,
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  sendBtnDisabled: {
    opacity: 0.38,
  },
  sendBtnText: {
    color: '#050816',
    fontSize: 20,
    fontWeight: '900',
  },
});
