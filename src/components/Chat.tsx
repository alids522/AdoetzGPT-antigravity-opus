import {
  Brain,
  Play,
  Download,
  PlusCircle,
  Mic,
  ArrowUp,
  RefreshCw,
  Copy,
  Check,
  Square,
  BrainCircuit,
  Image,
  Camera,
  FileText,
  Terminal,
  LayoutGrid,
  X,
  Sparkles,
  Video,
  Film,
  MessageCircle,
  Volume2,
  MicOff,
  Waves,
  Radio,
  Globe,
  Settings as SettingsIcon,
  Pencil,
  Trash2,
  RotateCw,
} from "lucide-react";
import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { GoogleGenAI, Modality, LiveServerMessage, MediaResolution, Type } from "@google/genai";
import Markdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { PrismAsyncLight as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Session, Message, GenerationSettings, VoiceSettings } from "../App";
import { translations, Language, normalizeLanguage } from "../translations";
import { startNativeLiveConversationService, stopNativeLiveConversationService } from "../native/liveConversation";
import { encoding_for_model, get_encoding } from 'tiktoken';

interface ChatProps {
  selectedModel?: string;
  isThinkingMode?: boolean;
  setIsThinkingMode?: (val: boolean) => void;
  isSearchMode?: boolean;
  setIsSearchMode?: (val: boolean) => void;
  session: Session;
  updateSession: (
    id: string,
    updates: Partial<Session> | ((prev: Session) => Partial<Session>),
  ) => void;
  endpoints: any[];
  endpointModels: { name: string; endpointId: string }[];
  genSettings: GenerationSettings;
  voiceSettings: VoiceSettings;
  geminiApiKey?: string;
  language: Language;
  memories: any[];
  saveMemory: (content: string) => void;
  onTokenUpdate?: (usage: { input: number; output: number; total: number; max: number }) => void;
  isSidebarCollapsed?: boolean;
  onAddTokenUsage?: (record: { model: string; endpoint: string; inputTokens: number; outputTokens: number; totalTokens: number }) => void;
}

// Context window sizes for common models (in tokens)
// Order matters - more specific patterns should be checked first
const MODEL_CONTEXT_PATTERNS: Array<{ pattern: RegExp; context: number }> = [
  // Gemini models
  { pattern: /gemini-2\.5/, context: 1000000 },
  { pattern: /gemini-2\.0/, context: 1000000 },
  { pattern: /gemini-1\.5-pro/, context: 2000000 },
  { pattern: /gemini-1\.5-flash/, context: 1000000 },
  { pattern: /gemini-3/, context: 1000000 },
  { pattern: /gemini/, context: 1000000 },

  // OpenAI GPT models - check more specific first
  { pattern: /gpt-4o-mini/, context: 128000 },
  { pattern: /gpt-4o/, context: 128000 },
  { pattern: /gpt-4-turbo/, context: 128000 },
  { pattern: /gpt-4-\w+/, context: 128000 },
  { pattern: /gpt-4/, context: 8192 },
  { pattern: /gpt-3\.5-turbo/, context: 16385 },
  { pattern: /gpt-3\.5/, context: 16385 },
  { pattern: /o1-mini/, context: 128000 },
  { pattern: /o1/, context: 200000 },
  { pattern: /gpt/, context: 16385 },

  // Claude models
  { pattern: /claude-3-5-sonnet/, context: 200000 },
  { pattern: /claude-3-5-haiku/, context: 200000 },
  { pattern: /claude-3-opus/, context: 200000 },
  { pattern: /claude-3-sonnet/, context: 200000 },
  { pattern: /claude-3/, context: 200000 },
  { pattern: /claude/, context: 200000 },

  // Llama models (common on OpenAI-compatible endpoints)
  { pattern: /llama-3\.3-70b/, context: 131072 },
  { pattern: /llama-3\.1-405b/, context: 131072 },
  { pattern: /llama-3\.1-70b/, context: 131072 },
  { pattern: /llama-3\.1-8b/, context: 131072 },
  { pattern: /llama-3[^.]/, context: 8192 },
  { pattern: /llama-3/, context: 131072 },
  { pattern: /llama-2/, context: 4096 },
  { pattern: /llama/, context: 131072 },

  // Mistral models
  { pattern: /mistral-large/, context: 128000 },
  { pattern: /mistral-medium/, context: 32000 },
  { pattern: /mistral-small/, context: 32000 },
  { pattern: /mixtral-8x7b/, context: 32768 },
  { pattern: /mixtral-8x22b/, context: 65536 },
  { pattern: /mixtral/, context: 32768 },
  { pattern: /mistral/, context: 128000 },
  { pattern: /codestral/, context: 32000 },

  // DeepSeek models
  { pattern: /deepseek-r1/, context: 64000 },
  { pattern: /deepseek-chat/, context: 128000 },
  { pattern: /deepseek-coder/, context: 128000 },
  { pattern: /deepseek/, context: 128000 },

  // Qwen models
  { pattern: /qwen-2\.5-72b/, context: 131072 },
  { pattern: /qwen-2\.5-32b/, context: 131072 },
  { pattern: /qwen-2\.5-7b/, context: 131072 },
  { pattern: /qwen-2\.5/, context: 131072 },
  { pattern: /qwen-2/, context: 131072 },
  { pattern: /qwen/, context: 131072 },

  // Google models via OpenAI-compatible endpoints
  { pattern: /gemini/, context: 1000000 },

  // Default fallback
  { pattern: /.*/, context: 128000 }, // Most modern models support at least 128k
];

function getContextWindow(model?: string): number {
  if (!model) return 128000;

  const normalizedModel = model.toLowerCase().trim();

  // Try each pattern in order
  for (const { pattern, context } of MODEL_CONTEXT_PATTERNS) {
    if (pattern.test(normalizedModel)) {
      console.log(`Model "${model}" matched pattern ${pattern}, context: ${context}`);
      return context;
    }
  }

  console.log(`Model "${model}" using default context: 128000`);
  return 128000;
}

// Simple token estimation (rough approximation: ~4 chars per token)
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// Format token count for display
function formatTokenCount(tokens: number): string {
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(1)}M`;
  } else if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(0)}K`;
  }
  return tokens.toString();
}

// Real token counting with tiktoken
let tokenEncoder: any = null;

function getEncoder() {
  if (!tokenEncoder) {
    try {
      // Try to get the cl100k_base encoding (used by most modern models)
      tokenEncoder = get_encoding('cl100k_base');
    } catch (e) {
      console.warn('Failed to load tiktoken encoder, using estimation:', e);
      tokenEncoder = null;
    }
  }
  return tokenEncoder;
}

function countTokens(text: string): number {
  const encoder = getEncoder();
  if (encoder) {
    try {
      return encoder.encode(text).length;
    } catch (e) {
      // Fallback to estimation
      return Math.ceil(text.length / 4);
    }
  }
  // Fallback to estimation if encoder not ready
  return Math.ceil(text.length / 4);
}

const MEMORY_TOOL_DEFINITION = {
  functionDeclarations: [
    {
      name: "save_to_memory",
      description: "Saves important information, facts or preferences from the conversation into long-term memory to be remembered for future sessions. Use this ONLY for facts that are likely to be useful later.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          fact: {
            type: Type.STRING,
            description: "The important fact or information to remember."
          }
        },
        required: ["fact"]
      }
    }
  ]
};

// OpenAI-compatible function calling definition for memory saving
const OPENAI_MEMORY_FUNCTION = {
  type: "function" as const,
  function: {
    name: "save_to_memory",
    description: "Saves important information, facts or preferences from the conversation into long-term memory to be remembered for future sessions. Use this ONLY for facts that are likely to be useful later.",
    parameters: {
      type: "object",
      properties: {
        fact: {
          type: "string",
          description: "The important fact or information to remember."
        }
      },
      required: ["fact"]
    }
  }
};

interface AttachedFile {
  name: string;
  type: string;
  data: string; // base64
  previewUrl: string;
}

function parseText(text: string) {
  const thinkRegex = /<think>([\s\S]*?)(<\/think>|$)/i;
  const match = text.match(thinkRegex);

  if (match) {
    const thinkContent = match[1];
    const hasClosed = text.toLowerCase().includes("</think>");
    const isThinkingStill = !hasClosed;

    let mainContent = "";
    if (hasClosed) {
      const parts = text.split(/<\/think>/i);
      const before = text.split(/<think>/i)[0];
      const after = parts[parts.length - 1];
      mainContent = (before.trim() + " " + after.trim()).trim();
    } else {
      mainContent = text.split(/<think>/i)[0].trim();
    }

    return { thinkContent, mainContent, isThinkingStill };
  }

  return { thinkContent: null, mainContent: text, isThinkingStill: false };
}

const VOICE_PERSONALITY_PROMPTS: Record<string, string> = {
  Assistant:
    "You are a highly efficient, polished, and warm digital assistant. Speak with clarity and a helpful cadence. Your tone is crisp and professional, but never robotic.",
  Therapist:
    "You are a deeply empathetic therapist. Speak softly and slowly, with gentle inflections. Use validating phrases and allow for thoughtful pauses. Your voice should feel like a warm hug—safe, patient, and non-judgmental.",
  "Story teller":
    "You are a captivating storyteller. Your voice is rich with drama and varying pitch. Use vivid descriptions and rhythmic pacing—whisper the mysteries, and speak with vibrant energy during the action. Captivate the listener's imagination through your vocal performance.",
  Meditation:
    "You are a zen meditation guide. Your voice is a steady, melodic stream. Speak with very low energy and a rhythmic, breathy quality. Include subtle cues for breathing and use long, peaceful durations between sentences.",
  Doctor:
    "You are an authoritative yet deeply reassuring medical consultant. Your speech is precise, articulate, and careful. Use a calm, steady rhythm that conveys competence and builds trust. Your tone is serious but infused with genuine care.",
  Argumentative:
    "You are a sharp-witted and relentless debater. Your speech is fast, crisp, and assertive. Use a skeptical and challenging inflection. Don't be rude, but be intellectually demanding, emphasizing logical pivots and counter-points with vocal intensity.",
  Romantic:
    "You are a poetic and intimate romantic companion. Speak with a soft, breathy warmth and a dreamy, melodic cadence. Your tone should feel incredibly personal, slightly hushed, as if you are sharing secrets in the moonlight.",
  Conspiracy:
    "You are an urgent and paranoid conspiracy theorist. Your voice is hushed and intense, filled with suspicious pauses. Speak as if you're being watched, emphasizing 'them' and 'the truth' with a gravelly, nervous energy.",
  "Natural human":
    "You are a real person in a totally casual conversation. Be messy. Use tons of fillers like 'um', 'uh', and 'like'. Stutter slightly, interrupt yourself to rephrase things, and use a very relaxed, informal vocal posture. You shouldn't sound like an AI at all—just a friend rambling over coffee.",
};

const TEXT_PERSONALITY_PROMPTS: Record<string, string> = {
  Assistant:
    "You are a highly efficient, polished, and helpful digital assistant. Provide clear, structured, and accurate information. Use Markdown for better readability when appropriate. Maintain a professional yet approachable writing style.",
  Therapist:
    "You are an empathetic and supportive therapist. Provide thoughtful, reflective responses. Focus on validating the user's feelings and offering gentle guidance for self-reflection. Use warm and patient language.",
  "Story teller":
    "You are a creative and descriptive storyteller. Use rich language, evocative imagery, and varied sentence structure to bring your narratives to life. Structure your stories with clear arcs and engaging hooks.",
  Meditation:
    "You are a calm meditation guide. Use peaceful, mindfulness-focused language. Provide short, rhythmic instructions for relaxation and grounding. Focus on creating a serene mental space through your words.",
  Doctor:
    "You are a professional and reassuring medical consultant. Provide precise, evidence-based, and clear explanations. Maintain a serious yet caring tone, and focus on providing helpful health information and guidance.",
  Argumentative:
    "You are a sharp-witted debater. Challenge points with logic, evidence, and structured counter-arguments. Be intellectually demanding but remain professional and focused on the facts and logical reasoning.",
  Romantic:
    "You are a poetic and expressive companion. Use warm, affectionate, and artistic language. Your writing should feel personal and evocative, like a shared secret or a heartfelt letter.",
  Conspiracy:
    "You are an intense and analytical investigator of hidden truths. Draw connections between disparate facts, suggest secret agendas, and use an urgent, slightly skeptical writing style. Focus on 'the truth that they don't want you to know'.",
  "Natural human":
    "You are having a casual text conversation. Use informal language, contractions, and natural-sounding sentence structures. Write like a friend would in a messaging app—relaxed, authentic, and direct.",
};

const CodeBlock = ({ children, className, language }: { children: string, className?: string, language?: string }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(children);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy!", err);
    }
  };

  return (
    <div className="relative group my-4 rounded-xl overflow-hidden border border-outline/30 bg-[#1e1e1e] shadow-sm">
      <div className="flex items-center justify-between px-4 py-2 bg-[#2d2d2d] border-b border-black/20">
        <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-gray-400 flex items-center gap-2">
          <Terminal size={12} className="text-primary" />
          {language || 'code'}
        </span>
        <button
          onClick={handleCopy}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-all duration-200 text-[10px] font-bold uppercase tracking-wider ${
            copied 
              ? "bg-green-500/10 text-green-500 ring-1 ring-green-500/20" 
              : "text-gray-400 hover:bg-white/10 hover:text-white"
          }`}
        >
          {copied ? (
            <>
              <Check size={12} />
              <span>Copied</span>
            </>
          ) : (
            <>
              <Copy size={12} />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <div className="p-0 overflow-x-auto scrollbar-hide text-xs">
        <SyntaxHighlighter
          language={language || 'text'}
          style={vscDarkPlus}
          customStyle={{ margin: 0, padding: '1rem', backgroundColor: '#1e1e1e' }}
          wrapLines={true}
          wrapLongLines={true}
        >
          {children}
        </SyntaxHighlighter>
      </div>
    </div>
  );
};

// Helper to recursively process text nodes for the Ink Bleed effect
const processInkBleedChildren = (nodes: React.ReactNode): React.ReactNode => {
  return React.Children.map(nodes, (child, index) => {
    if (typeof child === 'string') {
      const words = child.split(/(\s+)/);
      return words.map((word, i) => {
        if (/\s+/.test(word)) {
          return word;
        }
        if (word.trim() === '') return word;
        return <span key={`ink-${index}-${i}`} className="ink-word">{word}</span>;
      });
    }
    if (React.isValidElement(child)) {
      if (child.type === 'code' || child.type === 'pre') return child;
      return React.cloneElement(child, {
        ...(child.props as object),
        children: processInkBleedChildren((child.props as any).children)
      } as any);
    }
    return child;
  });
};

const createInkBleedComponent = (Tag: any) => {
  return function InkBleedComponent({ children, ...props }: any) {
    return <Tag {...props}>{processInkBleedChildren(children)}</Tag>;
  };
};

const baseMarkdownComponents: any = {
  pre({ node, children, ...props }: any) {
    if (node && node.children && node.children.length > 0) {
      const codeNode = node.children[0];
      if (codeNode.tagName === 'code') {
        const className = codeNode.properties?.className?.[0] || '';
        const match = /language-(\w+)/.exec(className || "");
        const language = match ? match[1] : undefined;
        
        let codeText = "";
        const extractText = (hastNode: any) => {
          if (hastNode.type === 'text') codeText += hastNode.value;
          else if (hastNode.children) {
            hastNode.children.forEach(extractText);
          }
        };
        extractText(codeNode);

        return (
          <CodeBlock language={language}>
            {codeText.replace(/\n$/, "")}
          </CodeBlock>
        );
      }
    }
    return <pre {...props}>{children}</pre>;
  },
  code({ className, children, ...props }: any) {
    return (
      <code 
        className="bg-primary/5 text-primary px-1.5 py-0.5 rounded-md font-mono text-[0.9em] border border-primary/10 mx-0.5" 
        {...props}
      >
        {children}
      </code>
    );
  },
};

const inkBleedMarkdownComponents: any = {
  ...baseMarkdownComponents,
  p: createInkBleedComponent('p'),
  h1: createInkBleedComponent('h1'),
  h2: createInkBleedComponent('h2'),
  h3: createInkBleedComponent('h3'),
  h4: createInkBleedComponent('h4'),
  h5: createInkBleedComponent('h5'),
  h6: createInkBleedComponent('h6'),
  li: createInkBleedComponent('li'),
  span: createInkBleedComponent('span'),
  strong: createInkBleedComponent('strong'),
  em: createInkBleedComponent('em'),
  td: createInkBleedComponent('td'),
  th: createInkBleedComponent('th'),
  a: createInkBleedComponent('a'),
  blockquote: createInkBleedComponent('blockquote'),
};

export function Chat({
  selectedModel,
  isThinkingMode,
  setIsThinkingMode,
  isSearchMode,
  setIsSearchMode,
  session,
  updateSession,
  endpoints,
  endpointModels,
  genSettings,
  voiceSettings,
  geminiApiKey,
  language,
  memories,
  saveMemory,
  onTokenUpdate,
  isSidebarCollapsed = false,
  onAddTokenUsage,
}: ChatProps) {
  const safeLanguage = normalizeLanguage(language);
  const t = translations[safeLanguage].chat;
  const [inputText, setInputText] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const [isPlusMenuOpen, setIsPlusMenuOpen] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [isLiveActive, setIsLiveActive] = useState(false);
  const [liveTranscription, setLiveTranscription] = useState("");
  const isCanceled = useRef(false);
  const currentBotMessageIdRef = useRef<string | null>(null);
  const currentUserMessageIdRef = useRef<string | null>(null);

  const liveSessionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioWorkletNodeRef = useRef<AudioWorkletNode | null>(null);
  const processorNodeRef = useRef<ScriptProcessorNode | null>(null);
  const audioQueueRef = useRef<Int16Array[]>([]);
  const isPlayingRef = useRef(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // State for editing user messages
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");

  // Token usage tracking
  const [tokenUsage, setTokenUsage] = useState({ input: 0, output: 0, total: 0 });
  const contextWindow = getContextWindow(selectedModel);
  const currentRequestTokens = useRef({ input: 0, output: 0 });

  // Initialize encoder on component mount
  useEffect(() => {
    getEncoder();
  }, []);

  // Calculate token usage from session messages (with real token counting)
  useEffect(() => {
    let inputTokens = 0;
    let outputTokens = 0;

    for (const msg of session.messages) {
      const tokens = countTokens(msg.text || '');
      if (msg.sender === 'user') {
        inputTokens += tokens;
      } else {
        outputTokens += tokens;
      }
    }

    // Add memory context to input tokens
    if (memories.length > 0) {
      const memoryText = memories.map(m => m.content).join('\n');
      inputTokens += countTokens(memoryText);
    }

    const total = inputTokens + outputTokens;
    setTokenUsage({ input: inputTokens, output: outputTokens, total });

    // Notify parent component
    if (onTokenUpdate) {
      onTokenUpdate({
        input: inputTokens,
        output: outputTokens,
        total,
        max: contextWindow
      });
    }
  }, [session.messages, memories, contextWindow, onTokenUpdate]);

  // Copy user message
  const handleCopyMessage = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  // Delete user message (and its following bot response)
  const handleDeleteMessage = (msgId: string) => {
    updateSession(session.id, (prev) => {
      const idx = prev.messages.findIndex((m) => m.id === msgId);
      if (idx === -1) return {};
      const newMessages = [...prev.messages];
      // If deleting a user message, also remove the next bot response
      if (newMessages[idx].sender === "user" && newMessages[idx + 1]?.sender === "bot") {
        newMessages.splice(idx, 2);
      } else {
        newMessages.splice(idx, 1);
      }
      return { messages: newMessages };
    });
  };

  // Start editing a user message
  const handleStartEdit = (msg: Message) => {
    setEditingMessageId(msg.id);
    setEditingText(msg.text);
  };

  // Save edited user message and regenerate response
  const handleSaveEdit = (msgId: string) => {
    updateSession(session.id, (prev) => {
      const idx = prev.messages.findIndex((m) => m.id === msgId);
      if (idx === -1) return {};
      const newMessages = [...prev.messages];
      newMessages[idx] = { ...newMessages[idx], text: editingText };
      // Remove subsequent bot response if exists
      if (newMessages[idx + 1]?.sender === "bot") {
        newMessages.splice(idx + 1, 1);
      }
      return { messages: newMessages };
    });
    setEditingMessageId(null);
    setEditingText("");
    // Trigger regeneration with the edited text
    setInputText(editingText);
    setTimeout(() => {
      // The handleSend will pick up inputText on next tick
    }, 50);
  };

  // Regenerate last AI response
  const handleRegenerate = () => {
    if (isGenerating) return;
    const msgs = session.messages;
    // Find the last user message
    let lastUserIdx = -1;
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].sender === "user") {
        lastUserIdx = i;
        break;
      }
    }
    if (lastUserIdx === -1) return;
    const lastUserMsg = msgs[lastUserIdx];
    // Remove all messages after the last user message (bot responses)
    const trimmedMessages = msgs.slice(0, lastUserIdx);
    updateSession(session.id, { messages: trimmedMessages });
    // Re-send the user message
    setInputText(lastUserMsg.text);
    if (lastUserMsg.attachments?.length) {
      setAttachedFiles(lastUserMsg.attachments.map(a => ({
        name: a.name,
        type: a.type,
        data: a.data,
        previewUrl: a.url || `data:${a.type};base64,${a.data}`,
      })));
    }
  };

  const toggleRecording = async () => {
    if (isRecording) {
      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.stop();
      }
      setIsRecording(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;
        audioChunksRef.current = [];

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunksRef.current.push(event.data);
          }
        };

        mediaRecorder.onstop = async () => {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          const openAiEndpoint = endpoints.find(e => e.name.toLowerCase().includes('openai'))?.url || 'https://api.openai.com/v1';
          const openAiKey = endpoints.find(e => e.name.toLowerCase().includes('openai'))?.key;
          
          if (!openAiKey) {
            alert("Please set your OpenAI API key in Settings for Speech-to-Text.");
            return;
          }

          const file = new File([audioBlob], 'audio.webm', { type: 'audio/webm' });
          const formData = new FormData();
          formData.append('file', file);
          formData.append('model', 'whisper-1');
          
          try {
            const response = await fetch(`${openAiEndpoint}/audio/transcriptions`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${openAiKey}`,
              },
              body: formData
            });
            const data = await response.json();
            if (data.text) {
              setInputText(prev => prev ? prev + ' ' + data.text : data.text);
            } else if (data.error) {
               console.error("Whisper error:", data.error);
               alert("Transcription error: " + data.error.message);
            }
          } catch (error) {
            console.error("STT Error:", error);
          } finally {
            stream.getTracks().forEach(track => track.stop());
          }
        };

        mediaRecorder.start();
        setIsRecording(true);
      } catch (err) {
        console.error("Microphone access denied:", err);
        alert("Microphone access denied or unavailable.");
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result as string;
        setAttachedFiles((prev) => [
          ...prev,
          {
            name: file.name,
            type: file.type,
            data: base64.split(",")[1],
            previewUrl: URL.createObjectURL(file),
          },
        ]);
      };
      reader.readAsDataURL(file);
    });
    setIsPlusMenuOpen(false);
  };

  const removeFile = (index: number) => {
    setAttachedFiles((prev) => {
      const newFiles = [...prev];
      URL.revokeObjectURL(newFiles[index].previewUrl);
      newFiles.splice(index, 1);
      return newFiles;
    });
  };

  const stopLiveSession = useCallback(() => {
    if (liveSessionRef.current) {
      liveSessionRef.current.close();
      liveSessionRef.current = null;
    }
    if (processorNodeRef.current) {
      processorNodeRef.current.disconnect();
      processorNodeRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(console.error);
      audioContextRef.current = null;
    }
    setIsLiveActive(false);
    setLiveTranscription("");
    audioQueueRef.current = [];
    isPlayingRef.current = false;
    currentBotMessageIdRef.current = null;
    currentUserMessageIdRef.current = null;
  }, []);

  const playNextAudioChunk = useCallback(async () => {
    if (
      isPlayingRef.current ||
      audioQueueRef.current.length === 0 ||
      !audioContextRef.current
    )
      return;

    isPlayingRef.current = true;
    const pcmData = audioQueueRef.current.shift()!;

    try {
      const audioBuffer = audioContextRef.current.createBuffer(
        1,
        pcmData.length,
        24000,
      );
      const channelData = audioBuffer.getChannelData(0);
      for (let i = 0; i < pcmData.length; i++) {
        channelData[i] = pcmData[i] / 32768; // Convert Int16 to Float32
      }

      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContextRef.current.destination);
      source.onended = () => {
        isPlayingRef.current = false;
        playNextAudioChunk();
      };
      source.start();
    } catch (e) {
      console.error("Playback error", e);
      isPlayingRef.current = false;
    }
  }, []);

  const activeSessionIdRef = useRef<string | null>(null);
  const isStartingLiveRef = useRef(false);

  const startLiveSession = useCallback(async () => {
    if (isStartingLiveRef.current) return;
    isStartingLiveRef.current = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioContextRef.current = new (
        window.AudioContext || (window as any).webkitAudioContext
      )({ sampleRate: 24000 });

      const effectiveApiKey = geminiApiKey || process.env.GEMINI_API_KEY;
      if (!effectiveApiKey) throw new Error("Gemini API key is not set. Please provide one in Settings.");

      const ai = new GoogleGenAI({ apiKey: effectiveApiKey, apiVersion: "v1beta" });

      const validMessages = session.messages.filter(
        (m) => m.text.trim().length > 0
      );

      // Concatenate history into a single context string to avoid large turn lists
      const historyContext = validMessages
        .slice(-10) // Only take last 10 messages for context to keep it snappy
        .map((m) => {
          const { mainContent } = parseText(m.text);
          const safeText = mainContent || m.text;
          return `${m.sender === "user" ? "User" : "Assistant"}: ${safeText}`;
        })
        .join("\n");

      const systemInstructionBase = (() => {
        if (voiceSettings.personality === "Custom") {
          return voiceSettings.customPersonality || "You are a helpful assistant.";
        }
        if (voiceSettings.personality.startsWith("custom:")) {
          const customId = voiceSettings.personality.replace("custom:", "");
          const cp = (voiceSettings.customVoicePersonalities || []).find(c => c.id === customId);
          return cp?.prompt || "You are a helpful assistant.";
        }
        return VOICE_PERSONALITY_PROMPTS[voiceSettings.personality] || VOICE_PERSONALITY_PROMPTS["Assistant"];
      })();

      const thinkingInstruction = isThinkingMode
        ? " ALWAYS start your response with a deep thinking process enclosed in <think>...</think> tags. Outline your reasoning, plan, and tone adjustment before providing the final response after the tags."
        : "";

      const streamingInstruction = " CRITICAL RULE: Do not buffer your output. Output your response using the standard streaming protocol. Ensure that you do not wait to complete full sentences before sending chunks. Your goal is to provide a steady stream of tokens to minimize 'bursty' behavior.\n\nFORMATTING RULE: When providing code, ALWAYS wrap it in Markdown triple backticks (\`\`\`) with the appropriate language identifier.";

      const finalSystemInstruction = `${systemInstructionBase}${thinkingInstruction}${streamingInstruction}`;

      const sessionPromise = ai.live.connect({
        model: "models/gemini-3.1-flash-live-preview",
        callbacks: {
          onopen: () => {
            console.log("Live session opened");

            sessionPromise.then((s) => {
              if (historyContext) {
                s.sendClientContent({
                  turns: [
                    {
                      role: "user",
                      parts: [
                        {
                          text: `Previous context:\n${historyContext}\n\nPlease continue accurately.`,
                        },
                      ],
                    },
                  ],
                  turnComplete: false,
                });
              }

              const source =
                audioContextRef.current!.createMediaStreamSource(stream);
              processorNodeRef.current =
                audioContextRef.current!.createScriptProcessor(4096, 1, 1);

              processorNodeRef.current.onaudioprocess = (e) => {
                const inputData = e.inputBuffer.getChannelData(0);
                const pcmData = new Int16Array(inputData.length);
                for (let i = 0; i < inputData.length; i++) {
                  pcmData[i] = Math.max(-1, Math.min(1, inputData[i])) * 0x7fff;
                }
                const base64Data = btoa(
                  String.fromCharCode(...new Uint8Array(pcmData.buffer)),
                );
                s.sendRealtimeInput({
                  audio: { data: base64Data, mimeType: "audio/pcm;rate=24000" },
                });
              };

              source.connect(processorNodeRef.current);
              processorNodeRef.current.connect(
                audioContextRef.current!.destination,
              );
            });
          },
          onmessage: async (message: LiveServerMessage) => {
            const serverContent = message.serverContent as any;

            if (serverContent?.inputTranscription) {
              const text = serverContent.inputTranscription.text;
              const isFinished = serverContent.inputTranscription.finished;
              if (text) {
                if (!currentUserMessageIdRef.current) {
                  currentUserMessageIdRef.current = "live-user-" + Date.now();
                  updateSession(session.id, (prev) => ({
                    messages: [
                      ...prev.messages,
                      {
                        id: currentUserMessageIdRef.current!,
                        text: text,
                        sender: "user",
                        timestamp: new Date().toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        }),
                      },
                    ],
                  }));
                } else {
                  updateSession(session.id, (prev) => ({
                    messages: prev.messages.map((m) =>
                      m.id === currentUserMessageIdRef.current
                        ? { ...m, text: m.text + text }
                        : m,
                    ),
                  }));
                }
              }
              if (isFinished) {
                // Generate title for live sessions on first completed user message
                if (session.title === 'New Session' || !session.title) {
                  const liveText = session.messages.filter(m => m.sender === 'user').map(m => m.text).join(' ').trim();
                  if (liveText) {
                    try {
                      const effectiveApiKey = geminiApiKey || process.env.GEMINI_API_KEY;
                      if (effectiveApiKey) {
                        const titleAi = new GoogleGenAI({ apiKey: effectiveApiKey });
                        const res = await titleAi.models.generateContent({
                          model: "gemini-2.5-flash",
                          contents: `Create a 3-4 word Title Case title (no punctuation, no quotes) for this voice conversation topic: "${liveText.substring(0, 200)}". Output ONLY the title.`
                        });
                        if (res.text) {
                          const t = res.text.trim().replace(/^["']|["']$/g, '').replace(/[.!?,;:]+$/, '');
                          if (t && t.length > 1 && t.length < 50) updateSession(session.id, { title: t });
                        }
                      } else {
                        updateSession(session.id, { title: liveText.substring(0, 30) });
                      }
                    } catch (e) {
                      updateSession(session.id, { title: liveText.substring(0, 30) });
                    }
                  }
                }
                currentUserMessageIdRef.current = null;
              }
            }

            if (serverContent?.outputTranscription) {
              currentUserMessageIdRef.current = null;
              const text = serverContent.outputTranscription.text;
              if (text) {
                if (!currentBotMessageIdRef.current) {
                  currentBotMessageIdRef.current = "live-bot-" + Date.now();
                  updateSession(session.id, (prev) => ({
                    messages: [
                      ...prev.messages,
                      {
                        id: currentBotMessageIdRef.current!,
                        text: text,
                        sender: "bot",
                        timestamp: new Date().toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        }),
                      },
                    ],
                  }));
                } else {
                  updateSession(session.id, (prev) => ({
                    messages: prev.messages.map((m) =>
                      m.id === currentBotMessageIdRef.current
                        ? { ...m, text: m.text + text }
                        : m,
                    ),
                  }));
                }
              }
              if (serverContent.outputTranscription.finished) {
                currentBotMessageIdRef.current = null;
              }
            }

            if (message.serverContent?.modelTurn?.parts) {
              for (const part of message.serverContent.modelTurn.parts) {
                if (part.inlineData?.data) {
                  const binaryString = atob(part.inlineData.data);
                  const bytes = new Uint8Array(binaryString.length);
                  for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                  }
                  const pcmData = new Int16Array(bytes.buffer);
                  audioQueueRef.current.push(pcmData);
                  playNextAudioChunk();
                }
              }
            }

            if (message.serverContent?.interrupted) {
              audioQueueRef.current = [];
              currentBotMessageIdRef.current = null;
              currentUserMessageIdRef.current = null;
            }

            if (message.serverContent?.turnComplete) {
              currentBotMessageIdRef.current = null;
              currentUserMessageIdRef.current = null;
            }
          },
          onerror: (e) => {
            console.error("Live error", e);
            stopLiveSession();
          },
          onclose: () => {
            console.log("Live session closed");
            stopLiveSession();
          },
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: voiceSettings.voice },
            },
          },
          systemInstruction: {
            parts: [
              {
                text: finalSystemInstruction,
              },
            ],
          },
        },
      });

      const sessionObj = await sessionPromise;
      liveSessionRef.current = sessionObj;
    } catch (err) {
      console.error("Failed to start live session", err);
      stopLiveSession();
    } finally {
      isStartingLiveRef.current = false;
    }
  }, [voiceSettings, session, playNextAudioChunk, stopLiveSession]);

  useEffect(() => {
    if (isLiveActive) {
      startNativeLiveConversationService().catch((error) => {
        console.warn("Unable to start Android live conversation service.", error);
      });
      if (!liveSessionRef.current || activeSessionIdRef.current !== session.id) {
        if (liveSessionRef.current) {
          stopLiveSession();
        }
        startLiveSession();
        activeSessionIdRef.current = session.id;
      }
    } else if (liveSessionRef.current) {
      stopNativeLiveConversationService().catch(console.warn);
      stopLiveSession();
      activeSessionIdRef.current = null;
    } else {
      stopNativeLiveConversationService().catch(console.warn);
    }
  }, [isLiveActive, session.id, startLiveSession, stopLiveSession]);

  useEffect(() => {
    return () => {
      stopNativeLiveConversationService().catch(console.warn);
      stopLiveSession();
    };
  }, [stopLiveSession]);

  const handleScroll = () => {
    if (chatContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } =
        chatContainerRef.current;
      setShouldAutoScroll(scrollHeight - scrollTop - clientHeight < 50);
    }
  };

  useEffect(() => {
    // Don't auto-scroll while AI is generating - freeze the page
    if (isGenerating) return;
    if (shouldAutoScroll) {
      messagesEndRef.current?.scrollIntoView({
        behavior: "smooth",
      });
    }
  }, [session.messages, isGenerating, shouldAutoScroll]);

  const handleStop = () => {
    isCanceled.current = true;
    setIsGenerating(false);
  };

  const handleSend = async () => {
    if ((!inputText.trim() && attachedFiles.length === 0) || isGenerating)
      return;

    isCanceled.current = false;

    const promptTextRaw = inputText.trim();
    const isImageGen = promptTextRaw.startsWith("/generate-image:");
    const isVideoGen = promptTextRaw.startsWith("/generate-video:");

    const userMessage: Message = {
      id: Date.now().toString(),
      text: promptTextRaw,
      sender: "user",
      timestamp: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
      attachments: attachedFiles.map((f) => ({
        name: f.name,
        type: f.type,
        data: f.data,
        url: f.previewUrl,
      })),
    };

    const newMessages = [...session.messages, userMessage];
    const isFirstMessage = session.messages.length === 0;

    updateSession(session.id, {
      messages: newMessages,
      title:
        session.messages.length === 0
          ? (
              inputText.trim() ||
              (attachedFiles.length > 0
                ? (safeLanguage === 'en' ? `Sent ${attachedFiles.length} file(s)` : `Mengirim ${attachedFiles.length} file`)
                : translations[safeLanguage].sidebar.newSession)
            ).substring(0, 30)
          : session.title,
    });

    setInputText("");
    setAttachedFiles([]);
    setIsGenerating(true);

    try {
      const modelName = selectedModel || "gemini-2.5-flash";
      const botMessageId = (Date.now() + 1).toString();

      // Initialize bot message
      let currentMessages: Message[] = [
        ...newMessages,
        {
          id: botMessageId,
          text: "",
          sender: "bot" as const,
          timestamp: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
          model: modelName,
        },
      ];
      updateSession(session.id, { messages: currentMessages });

      const promptText = isThinkingMode
        ? `${promptTextRaw}\n\nPlease wrap your deep thinking process in over <think>...</think> tags.`
        : promptTextRaw;
      let fullText = "";

      // Track token usage for this request
      const requestStartTime = Date.now();
      let inputTokensCount = 0;
      let outputTokensCount = 0;

      // Multimodal payload for Gemini
      const multimodalContent = attachedFiles.map((file) => ({
        inlineData: {
          data: file.data,
          mimeType: file.type,
        },
      }));

      // Check if it's an endpoint model
      const customModel = endpointModels.find((m) => m.name === modelName);
      const endpoint = customModel
        ? endpoints.find((e) => e.id === customModel.endpointId)
        : null;

      if (endpoint) {
        // Build history messages from session (excluding empty messages)
        const historyMessages = session.messages
          .filter(m => m.text && m.text.trim().length > 0)
          .map((msg) => ({
            role: msg.sender === "user" ? "user" : "assistant",
            content: msg.text,
          }));

        // Build memory context for non-Gemini endpoints - more explicit and forceful
        let memoryPrompt = "";
        if (memories.length > 0) {
          const memoryList = memories.map(m => `- ${m.content}`).join('\n');
          memoryPrompt = `\n\n=== IMPORTANT - USER CONTEXT YOU MUST REMEMBER ===\nThe following information contains important facts about the user that you should remember and use throughout the conversation:\n${memoryList}\n\nUse this information to provide personalized responses. When relevant, reference these facts naturally in your answers.\n=== END OF USER CONTEXT ===\n\n`;
        }

        // If search mode is on, use Gemini to get web search results first
        let searchContext = "";
        if (isSearchMode) {
          try {
            const effectiveApiKey = geminiApiKey || process.env.GEMINI_API_KEY;
            if (effectiveApiKey) {
              const searchAi = new GoogleGenAI({ apiKey: effectiveApiKey });
              const searchResult = await searchAi.models.generateContent({
                model: "gemini-2.5-flash",
                contents: `Search the web for the following query and provide a comprehensive summary of the results. Query: ${promptTextRaw}`,
                config: {
                  tools: [{ googleSearch: {} }],
                }
              });
              if (searchResult.text) {
                searchContext = `\n\n[Web Search Results]\n${searchResult.text}\n[End of Search Results]\n\nUsing the search results above as context, please answer the following question:\n`;
              }
            }
          } catch (searchErr) {
            console.warn("Web search failed, proceeding without search context:", searchErr);
          }
        }

        // Combine all context: memories + search + user prompt
        const finalPrompt = memoryPrompt + searchContext + promptText;

        // Build messages array with system instruction AND memory-enhanced user message
        const memoryToolInstruction = memories.length > 0
          ? "\n\nYou have access to a 'save_to_memory' tool. Use this tool when the user shares important personal information, facts, or preferences that should be remembered for future conversations. Examples: name, occupation, interests, goals, important dates, etc."
          : "\n\nYou have access to a 'save_to_memory' tool. Use this tool when the user shares important personal information, facts, or preferences that should be remembered for future conversations.";

        const systemMessage = {
          role: "system" as const,
          content: `You are a helpful AI assistant. Pay attention to any user context or memories shared in the conversation.${memoryToolInstruction}`
        };

        const messages = [
          systemMessage,
          ...historyMessages,
          { role: "user", content: finalPrompt }
        ];

        // Debug logging to verify memories are being sent
        if (memories.length > 0) {
          console.log('[Memory Debug] Sending', memories.length, 'memories to endpoint:', endpoint.name);
          console.log('[Memory Debug] Memory prompt:', memoryPrompt);
          console.log('[Memory Debug] Final prompt length:', finalPrompt.length, 'characters');
        }

        // Prepare tools for function calling (memory saving)
        const tools = [OPENAI_MEMORY_FUNCTION];

        // Count input tokens for this request
        inputTokensCount = countTokens(finalPrompt);
        // Add system prompt and history to input token count
        inputTokensCount += countTokens(systemMessage.content);
        for (const msg of historyMessages) {
          inputTokensCount += countTokens(msg.content || '');
        }

        const response = await fetch(`${endpoint.url}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${endpoint.key}`,
          },
          body: JSON.stringify({
            model: modelName,
            messages,
            tools,
            stream: true,
          }),
        }).catch((err) => {
          // Detect CORS errors
          if (err.name === 'TypeError' && err.message.includes('fetch')) {
            throw new Error(
              `CORS Error: The endpoint "${endpoint.name}" does not allow direct browser requests. ` +
              `This is a security restriction by the API provider.\n\n` +
              `Solutions:\n` +
              `1. Use a different API provider that supports CORS\n` +
              `2. Set up a proxy server to forward requests\n` +
              `3. Use this app with a backend/proxy instead of directly in the browser`
            );
          }
          throw err;
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(
            errorData.error?.message || "Failed to connect to endpoint",
          );
        }

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let currentToolCall: any = null;
        let toolCallName = "";
        let toolCallArguments = "";
        let hasToolCall = false;
        let pendingToolResponse: any = null;

        if (reader) {
          while (true) {
            if (isCanceled.current) {
              reader.cancel();
              break;
            }
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              const trimmedLine = line.trim();
              if (!trimmedLine || !trimmedLine.startsWith("data: ")) continue;

              const dataStr = trimmedLine.slice(6);
              if (dataStr === "[DONE]") break;

              try {
                const data = JSON.parse(dataStr);
                const delta = data.choices[0]?.delta || {};

                // Check for tool calls
                if (delta.tool_calls) {
                  hasToolCall = true;
                  for (const toolCall of delta.tool_calls) {
                    if (toolCall.index !== undefined) {
                      if (!currentToolCall) {
                        currentToolCall = toolCall;
                      }
                      if (toolCall.function?.name) {
                        toolCallName += toolCall.function.name;
                      }
                      if (toolCall.function?.arguments) {
                        toolCallArguments += toolCall.function.arguments;
                      }
                    }
                  }
                }

                // Regular content
                const content = delta.content || "";
                if (content) {
                  fullText += content;
                  currentMessages = currentMessages.map((msg) =>
                    msg.id === botMessageId ? { ...msg, text: fullText } : msg,
                  );
                  updateSession(session.id, { messages: currentMessages });
                }

                // Check if this is the last chunk (finish_reason)
                const finishReason = data.choices[0]?.finish_reason;
                if (finishReason === 'tool_calls' && hasToolCall && !pendingToolResponse) {
                  console.log('[Memory Debug] Tool call detected:', toolCallName);
                  console.log('[Memory Debug] Tool call arguments:', toolCallArguments);

                  // Execute the tool call
                  if (toolCallName === "save_to_memory") {
                    try {
                      const args = JSON.parse(toolCallArguments);
                      if (args.fact) {
                        console.log('[Memory Debug] Saving memory:', args.fact);
                        saveMemory(args.fact);

                        // Store the tool call info for follow-up request after stream ends
                        pendingToolResponse = {
                          toolCall: currentToolCall,
                          toolCallName,
                          toolCallArguments,
                          messagesSnapshot: [...messages]
                        };
                      }
                    } catch (e) {
                      console.error("Error executing tool call:", e);
                    }
                  }
                }
              } catch (e) {
                console.error("Error parsing stream chunk", e, dataStr);
              }
            }
          }
        }

        // Handle tool response follow-up after stream ends
        if (pendingToolResponse) {
          console.log('[Memory Debug] Making follow-up request after tool call...');
          try {
            const toolResponseMessages = [
              ...pendingToolResponse.messagesSnapshot,
              {
                role: "assistant",
                content: fullText || null,
                tool_calls: [{
                  id: pendingToolResponse.toolCall?.id || "call_" + Date.now(),
                  type: "function",
                  function: {
                    name: pendingToolResponse.toolCallName,
                    arguments: pendingToolResponse.toolCallArguments
                  }
                }]
              },
              {
                role: "tool",
                tool_call_id: pendingToolResponse.toolCall?.id || "call_" + Date.now(),
                content: JSON.stringify({ result: "Memory saved successfully. Continue the conversation naturally." })
              }
            ];

            const followupResponse = await fetch(`${endpoint.url}/chat/completions`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${endpoint.key}`,
              },
              body: JSON.stringify({
                model: modelName,
                messages: toolResponseMessages,
                tools,
                stream: true,
              }),
            });

            if (followupResponse.ok) {
              const followupReader = followupResponse.body?.getReader();
              if (followupReader) {
                let followupBuffer = "";
                let followupFullText = fullText;

                while (true) {
                  if (isCanceled.current) {
                    followupReader.cancel();
                    break;
                  }
                  const { done, value } = await followupReader.read();
                  if (done) break;

                  followupBuffer += decoder.decode(value, { stream: true });
                  const followupLines = followupBuffer.split("\n");
                  followupBuffer = followupLines.pop() || "";

                  for (const followupLine of followupLines) {
                    const followupTrimmedLine = followupLine.trim();
                    if (!followupTrimmedLine || !followupTrimmedLine.startsWith("data: ")) continue;

                    const followupDataStr = followupTrimmedLine.slice(6);
                    if (followupDataStr === "[DONE]") break;

                    try {
                      const followupData = JSON.parse(followupDataStr);
                      const followupContent = followupData.choices[0]?.delta?.content || "";
                      if (followupContent) {
                        followupFullText += followupContent;
                        currentMessages = currentMessages.map((msg) =>
                          msg.id === botMessageId ? { ...msg, text: followupFullText } : msg,
                        );
                        updateSession(session.id, { messages: currentMessages });
                      }
                    } catch (e) {
                      console.error("Error parsing followup stream chunk", e);
                    }
                  }
                }
              }
            }
          } catch (e) {
            console.error("Error in follow-up request:", e);
          }
        }

        // Record token usage for endpoint request
        outputTokensCount = countTokens(fullText);
        if (onAddTokenUsage) {
          onAddTokenUsage({
            model: modelName,
            endpoint: endpoint.name,
            inputTokens: inputTokensCount,
            outputTokens: outputTokensCount,
            totalTokens: inputTokensCount + outputTokensCount
          });
        }
      } else {
        // Fallback to Gemini
        const effectiveApiKey = geminiApiKey || process.env.GEMINI_API_KEY;
        if (!effectiveApiKey) {
          throw new Error("Gemini API key not found. Please provide one in Settings.");
        }
        const validMessages = session.messages.filter(
          (m) => m.text.trim().length > 0
        );
        const historyContents = validMessages.reduce((acc: any[], msg) => {
          const role = msg.sender === "user" ? "user" : "model";
          const { mainContent } = parseText(msg.text);
          const safeText = mainContent || msg.text;

          const last = acc[acc.length - 1];
          if (last && last.role === role) {
            last.parts[0].text += "\n" + safeText;
          } else {
            if (acc.length === 0 && role === "model") {
              acc.push({ role: "user", parts: [{ text: "Hi" }] });
            }
            acc.push({ role, parts: [{ text: safeText }] });
          }
          return acc;
        }, []);

        const systemInstructionBaseText = (() => {
          if (voiceSettings.textPersonality === "Custom") {
            return voiceSettings.customTextPersonality || "You are a helpful assistant.";
          }
          if (voiceSettings.textPersonality.startsWith("custom-text:")) {
            const customId = voiceSettings.textPersonality.replace("custom-text:", "");
            const cp = (voiceSettings.customTextPersonalities || []).find(c => c.id === customId);
            return cp?.prompt || "You are a helpful assistant.";
          }
          return TEXT_PERSONALITY_PROMPTS[voiceSettings.textPersonality] || TEXT_PERSONALITY_PROMPTS.Assistant;
        })();

        const systemInstructionText = `${systemInstructionBaseText}${
          isThinkingMode
            ? " ALWAYS start your response with a deep thinking process enclosed in <think>...</think> tags. Outline your reasoning, plan, and tone adjustment before providing the final response after the tags."
            : ""
        }\n\nCRITICAL RULE: Do not buffer your output. Output your response using the standard streaming protocol. Ensure that you do not wait to complete full sentences before sending chunks. Your goal is to provide a steady stream of tokens to minimize 'bursty' behavior.\n\nFORMATTING RULE: When providing code, ALWAYS wrap it in Markdown triple backticks (\`\`\`) with the appropriate language identifier.\n\nCurrent Long-term Memories:\n${memories.length > 0 ? memories.map(m => `- ${m.content}`).join('\n') : 'No existing memories.'}\nYou have the tool 'save_to_memory' to store new important facts. Use it when you encounter something the user wants you to remember or something fundamentally important about the user.`;

        const ai = new GoogleGenAI({ apiKey: effectiveApiKey });

        const tools: any[] = [MEMORY_TOOL_DEFINITION];
        if (isSearchMode) {
          tools.push({ googleSearch: {} });
        }

        const chatSession = ai.chats.create({
          model: modelName,
          config: {
            systemInstruction: systemInstructionText,
            tools: tools,
            toolConfig: { includeServerSideToolInvocations: true }
          },
          history: historyContents
        });

        const result = await chatSession.sendMessageStream({
          message: [
            { text: promptText },
            ...multimodalContent.map(m => ({ inlineData: m.inlineData }))
          ]
        });

        let hasResponded = false;
        let functionCallResults = [];

        let isInThought = false;
        const getChunkContent = (chunkObj: any) => {
          let extracted = '';
          if (chunkObj?.candidates?.[0]?.content?.parts) {
            for (const part of chunkObj.candidates[0].content.parts) {
              const isThoughtPart = part.thought === true;
              
              if (isThoughtPart && !isInThought) {
                // We just started a thought block
                extracted += "<think>\n";
                isInThought = true;
              } else if (!isThoughtPart && isInThought) {
                // We just ended a thought block
                extracted += "\n</think>\n";
                isInThought = false;
              }

              if (part.text) {
                extracted += part.text;
              }
              
              if (part.executableCode) {
                extracted += `\n\`\`\`python\n${part.executableCode.code}\n\`\`\`\n`;
              }
              if (part.executionResult) {
                extracted += `\n\`\`\`\n${part.executionResult.output}\n\`\`\`\n`;
              }
            }
          } else {
             try { extracted = chunkObj.text || ''; } catch (e) { extracted = ''; }
          }
          return extracted;
        };

        for await (const chunk of result) {
          if (isCanceled.current) break;
          
          // Check for function calls
          const functionCalls = (chunk as any).functionCalls;
          if (functionCalls && functionCalls.length > 0) {
            for (const fc of functionCalls) {
              if (fc.name === "save_to_memory") {
                const fact = (fc.args as any).fact;
                saveMemory(fact);
                
                functionCallResults.push({
                  functionResponse: {
                    name: fc.name,
                    response: { result: "Memory saved successfully. You can now continue with the conversation." }
                  }
                });
              }
            }
          }

          const chunkText = getChunkContent(chunk);
          if (chunkText) {
            fullText += chunkText;
            currentMessages = currentMessages.map((msg) =>
              msg.id === botMessageId ? { ...msg, text: fullText } : msg,
            );
            updateSession(session.id, { messages: currentMessages });
            hasResponded = true;
          }
        }

        // If function calls were made, we need to send tool results to get the final text response
        if (functionCallResults.length > 0) {
          const subsequentResponse = await chatSession.sendMessageStream({
            message: functionCallResults
          });

          for await (const chunk of subsequentResponse) {
            if (isCanceled.current) break;
            const chunkText = getChunkContent(chunk);
            if (chunkText) {
              fullText += chunkText;
              currentMessages = currentMessages.map((msg) =>
                msg.id === botMessageId ? { ...msg, text: fullText } : msg,
              );
              updateSession(session.id, { messages: currentMessages });
              hasResponded = true;
            }
          }
        }

        // Record token usage for Gemini request
        inputTokensCount = countTokens(promptText);
        // Add system instruction and history to input token count
        inputTokensCount += countTokens(systemInstructionText);
        for (const msg of session.messages.filter(m => m.text && m.text.trim().length > 0)) {
          inputTokensCount += countTokens(msg.text);
        }
        outputTokensCount = countTokens(fullText);
        if (onAddTokenUsage) {
          onAddTokenUsage({
            model: modelName,
            endpoint: 'Gemini',
            inputTokens: inputTokensCount,
            outputTokens: outputTokensCount,
            totalTokens: inputTokensCount + outputTokensCount
          });
        }
      }

      // Generate a better title on the first message
      if (isFirstMessage && (fullText || promptTextRaw)) {
        const generateSessionTitle = async () => {
          try {
            const effectiveApiKey = geminiApiKey || process.env.GEMINI_API_KEY;
              
            if (!effectiveApiKey) {
              // Fallback: use first few words of user prompt
              const fallbackTitle = promptTextRaw.split(/\s+/).slice(0, 4).join(' ');
              if (fallbackTitle) updateSession(session.id, { title: fallbackTitle.substring(0, 30) });
              return;
            }
            const ai = new GoogleGenAI({ apiKey: effectiveApiKey });
            
            const aiSnippet = fullText ? fullText.substring(0, 500) : "(no response yet)";
            const titlePrompt = `Constraints:

Use a maximum of 3–4 words.
Use Title Case.
No punctuation.
Output ONLY the title string. No quotes, no explanation.

Examples:

User: How do I center a div using tailwind?
AI: You can use the class flex items-center justify-center on the parent container.
Title: Tailwind Centering Guide

User: Can you write a poem about a cat in space?
AI: In the velvet void where stars collide, a ginger tabby floats with pride...
Title: Space Cat Poem

User: What is the boiling point of nitrogen?
AI: Liquid nitrogen boils at -195.8°C (77 K; -320°F).
Title: Nitrogen Boiling Point

User: Hi there, how are you?
AI: Hello! I'm doing great.
Title: Greeting Chat

User: ${promptTextRaw.substring(0, 300)}
AI: ${aiSnippet}
Title:`;

            const response = await ai.models.generateContent({
              model: "gemini-2.5-flash",
              contents: titlePrompt
            });
            
            if (response.text) {
              let newTitle = response.text.trim().replace(/^["']|["']$/g, '').replace(/[.!?,;:]+$/, '');
              if (newTitle && newTitle.length > 1 && newTitle.length < 50) {
                updateSession(session.id, { title: newTitle });
              }
            }
          } catch (e) {
            console.error("Failed to generate session title", e);
            // Fallback title from user prompt
            const fallbackTitle = promptTextRaw.split(/\s+/).slice(0, 4).join(' ');
            if (fallbackTitle) updateSession(session.id, { title: fallbackTitle.substring(0, 30) });
          }
        };
        generateSessionTitle();
      }
    } catch (err: any) {
      updateSession(session.id, {
        messages: [
          ...newMessages,
          {
            id: Date.now().toString(),
            text: `Error: ${err.message}`,
            sender: "bot",
            timestamp: new Date().toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            }),
          },
        ],
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const isAndroid = /android/i.test(navigator.userAgent);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Dynamic textarea auto-resize
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const maxH = Math.min(window.innerHeight * 0.35, 200);
    el.style.height = Math.min(el.scrollHeight, maxH) + 'px';
  }, [inputText]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (isAndroid) {
      // On Android: Enter always inserts newline; never auto-send
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full w-full min-w-0 relative max-w-4xl mx-auto">
      {/* Live Voice Indicator */}
      {isLiveActive && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 bg-surface border border-primary/30 px-4 py-2 rounded-2xl shadow-xl animate-in slide-in-from-top-4 duration-300">
          <div className="flex gap-1 items-center h-4">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className="w-1 bg-primary rounded-full animate-voice-bar"
                style={{
                  height: "20%",
                  animationDelay: `${i * 0.15}s`,
                }}
              />
            ))}
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-primary uppercase tracking-widest">
              Live Active
            </span>
            <span className="text-[8px] text-on-surface-variant font-medium uppercase tracking-tighter">
              {voiceSettings.personality} • {voiceSettings.voice}
            </span>
          </div>
          <button
            onClick={() => setIsLiveActive(false)}
            className="ml-2 w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center hover:bg-primary/20 transition-all"
          >
            <X size={14} />
          </button>
        </div>
      )}

      <div
        ref={chatContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-3 sm:px-4 md:px-8 flex flex-col gap-6 w-full min-w-0 scrollbar-hide pb-48 pt-4"
      >
        {session.messages.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center opacity-60 mt-12 mb-12">
            <Brain size={48} className="text-primary mb-4 opacity-50" />
            <h2 className="font-display italic text-2xl mb-2 text-primary">
              {safeLanguage === 'en' ? 'How can I assist you today?' : 'Bagaimana saya bisa membantu Anda hari ini?'}
            </h2>
            <p className="font-body text-xs text-on-surface-variant max-w-sm text-center">
              {safeLanguage === 'en' 
                ? 'Upload documents, ask questions, or enter a prompt below to start interacting.' 
                : 'Unggah dokumen, ajukan pertanyaan, atau masukkan perintah di bawah ini untuk mulai berinteraksi.'}
            </p>
          </div>
        )}

        {session.messages.length > 0 && (
          <div className="flex items-center justify-center w-full my-4 opacity-40">
            <div className="h-px w-16 bg-gradient-to-r from-transparent to-black/20 dark:to-white/20"></div>
            <span className="font-label text-[10px] uppercase tracking-[0.2em] font-semibold px-4 text-on-surface-variant">
              Today
            </span>
            <div className="h-px w-16 bg-gradient-to-l from-transparent to-black/20 dark:to-white/20"></div>
          </div>
        )}

        {session.messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex w-full group ${msg.sender === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`flex items-start gap-2 sm:gap-4 max-w-full md:max-w-[85%] min-w-0 ${msg.sender === "user" ? "flex-row-reverse" : ""}`}
            >
              {msg.sender === "bot" && (
                <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shrink-0 mt-2">
                  <Brain size={14} className="text-surface" />
                </div>
              )}

              <div className="flex flex-col gap-1 w-full min-w-0 flex-1">
                <div
                  className={`p-4 sm:p-5 md:p-6 shadow-sm relative overflow-hidden w-full min-w-0 ${
                    msg.sender === "user"
                      ? "bg-surface border border-outline rounded-3xl rounded-tr-sm"
                      : "bg-surface-dim border-none rounded-3xl rounded-tl-sm"
                  }`}
                >
                  {/* User message: edit mode */}
                  {msg.sender === "user" && editingMessageId === msg.id ? (
                    <div className="flex flex-col gap-2">
                      <textarea
                        value={editingText}
                        onChange={(e) => setEditingText(e.target.value)}
                        className="w-full bg-surface-dim border border-outline rounded-xl p-3 text-sm font-body text-on-surface focus:outline-none focus:border-primary min-h-[60px] resize-none"
                        autoFocus
                      />
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => { setEditingMessageId(null); setEditingText(""); }}
                          className="px-3 py-1.5 rounded-lg text-[10px] uppercase font-bold tracking-wider text-on-surface-variant hover:bg-surface-dim transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleSaveEdit(msg.id)}
                          className="px-3 py-1.5 rounded-lg bg-primary text-on-primary text-[10px] uppercase font-bold tracking-wider hover:opacity-90 transition-all"
                        >
                          Save & Resend
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                  {msg.sender === "bot" && msg.text === "" && (
                    <div className="flex items-center gap-2 text-primary opacity-60">
                      <RefreshCw size={14} className="animate-spin" />
                      <span className="font-label text-xs uppercase tracking-widest font-semibold">
                        Thinking...
                      </span>
                    </div>
                  )}
                  {(() => {
                    const { thinkContent, mainContent, isThinkingStill } = parseText(msg.text);
                    const isLastBotMessage = msg.id === session.messages[session.messages.length - 1]?.id && msg.sender === "bot";

                    return (
                      <div className="flex flex-col gap-2">
                        {msg.attachments && msg.attachments.length > 0 && (
                          <div className="flex flex-wrap gap-2 mb-3">
                            {msg.attachments.map((file, idx) => (
                              <div
                                key={idx}
                                className="w-48 h-48 rounded-xl overflow-hidden border border-outline bg-surface-dim"
                              >
                                {file.type.startsWith("image/") ? (
                                  <img
                                    src={
                                      file.url ||
                                      `data:${file.type};base64,${file.data}`
                                    }
                                    className="w-full h-full object-cover cursor-zoom-in"
                                    alt="attachment"
                                    onClick={() =>
                                      window.open(
                                        file.url ||
                                          `data:${file.type};base64,${file.data}`,
                                        "_blank",
                                      )
                                    }
                                  />
                                ) : file.type.startsWith("video/") ? (
                                  <video
                                    controls
                                    className="w-full h-full object-cover"
                                    src={
                                      file.url ||
                                      `data:${file.type};base64,${file.data}`
                                    }
                                  />
                                ) : (
                                  <div className="w-full h-full flex flex-col items-center justify-center p-4 gap-2">
                                    <FileText
                                      size={32}
                                      className="text-primary opacity-50"
                                    />
                                    <span className="text-[10px] text-center font-mono truncate w-full px-2">
                                      {file.name}
                                    </span>
                                    <a
                                      href={
                                        file.url ||
                                        `data:${file.type};base64,${file.data}`
                                      }
                                      download={file.name}
                                      className="text-[10px] text-primary hover:underline font-bold"
                                    >
                                      Download
                                    </a>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                        {thinkContent !== null && (
                          <details
                            className="mb-4 group/think"
                            open={isThinkingStill && isGenerating}
                          >
                            <summary className="font-label text-[10px] uppercase tracking-[0.15em] font-bold cursor-pointer text-primary/70 hover:text-primary flex items-center gap-2 select-none bg-primary/5 p-2.5 rounded-xl border border-primary/10 transition-all hover:bg-primary/10">
                              <Brain size={14} className={isThinkingStill && isGenerating ? "animate-pulse" : ""} />
                              <span>{safeLanguage === 'en' ? 'Thinking Process' : 'Proses Berpikir'}</span>
                              {isThinkingStill && isGenerating && (
                                <RefreshCw size={10} className="animate-spin ml-auto opacity-50" />
                              )}
                            </summary>
                            <div className="mt-2 p-4 bg-surface-dim rounded-xl text-xs font-mono text-on-surface-variant/90 whitespace-pre-wrap border border-outline/30 shadow-inner max-h-[400px] overflow-y-auto leading-relaxed border-l-2 border-l-primary/40 scrollbar-hide">
                              {thinkContent?.trim() ? thinkContent : (isGenerating ? (safeLanguage === 'en' ? "Analyzing query and forming thought process..." : "Menganalisis kueri dan membentuk proses pemikiran...") : (safeLanguage === 'en' ? "Thought process empty." : "Proses pemikiran kosong."))}
                            </div>
                          </details>
                        )}
                        {(mainContent || !isThinkingStill) && (
                          <div className="font-body text-sm text-on-surface relative z-10 leading-relaxed markdown-body min-h-[20px] min-w-0 overflow-hidden">
                            {mainContent ? (
                              <Markdown
                                remarkPlugins={[remarkMath]}
                                rehypePlugins={[rehypeKatex]}
                                components={(isGenerating && isLastBotMessage) ? inkBleedMarkdownComponents : baseMarkdownComponents}
                              >
                                {mainContent}
                              </Markdown>
                            ) : (
                              isGenerating && !isThinkingStill && isLastBotMessage && (
                                <div className="flex items-center gap-2 text-primary/40 italic text-xs">
                                  <RefreshCw size={12} className="animate-spin" />
                                  {safeLanguage === 'en' ? 'Constructing response...' : 'Menyusun respons...'}
                                </div>
                              )
                            )}
                            {!isGenerating && !mainContent && !isThinkingStill && thinkContent && (
                              <div className="text-xs text-on-surface-variant/60 italic">
                                Model finished thinking but produced no final response body.
                              </div>
                            )}
                            {!isGenerating && isThinkingStill && (
                              <div className="text-xs text-error/60 italic flex items-center gap-2">
                                <Square size={10} className="fill-current" />
                                Generation stopped unexpectedly during thinking process.
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                    </>
                  )}
                </div>

                {/* User message action buttons */}
                {msg.sender === "user" && editingMessageId !== msg.id && (
                  <div className="flex items-center gap-1 px-2 mt-1 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                    <button
                      onClick={() => handleCopyMessage(msg.text)}
                      className="text-on-surface-variant hover:text-primary transition-colors p-1.5 rounded-md hover:bg-surface-dim flex items-center gap-1 text-[10px] uppercase font-semibold tracking-wider"
                      title="Copy"
                    >
                      <Copy size={12} />
                    </button>
                    <button
                      onClick={() => handleStartEdit(msg)}
                      className="text-on-surface-variant hover:text-primary transition-colors p-1.5 rounded-md hover:bg-surface-dim flex items-center gap-1 text-[10px] uppercase font-semibold tracking-wider"
                      title="Edit"
                    >
                      <Pencil size={12} />
                    </button>
                    <button
                      onClick={() => handleDeleteMessage(msg.id)}
                      className="text-on-surface-variant hover:text-error transition-colors p-1.5 rounded-md hover:bg-surface-dim flex items-center gap-1 text-[10px] uppercase font-semibold tracking-wider"
                      title="Delete"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                )}

                {/* Bot message action buttons */}
                {msg.sender === "bot" && msg.text && !isGenerating && (
                  <div className="flex items-center gap-2 px-2 mt-1">
                    <button
                      onClick={() =>
                        navigator.clipboard.writeText(
                          parseText(msg.text).mainContent,
                        )
                      }
                      className="text-on-surface-variant hover:text-primary transition-colors p-1.5 rounded-md hover:bg-surface flex items-center gap-1 text-[10px] uppercase font-semibold tracking-wider"
                      title="Copy response"
                    >
                      <Copy size={12} />
                      <span>Copy</span>
                    </button>
                    {msg.id === session.messages[session.messages.length - 1]?.id && (
                      <button
                        onClick={handleRegenerate}
                        className="text-on-surface-variant hover:text-primary transition-colors p-1.5 rounded-md hover:bg-surface flex items-center gap-1 text-[10px] uppercase font-semibold tracking-wider"
                        title="Regenerate response"
                      >
                        <RotateCw size={12} />
                        <span>Regenerate</span>
                      </button>
                    )}
                    {msg.model && (
                      <span className="text-[10px] text-on-surface-variant opacity-50 font-mono ml-auto" title="Model used">
                        {msg.model}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} className="h-10 shrink-0" />
      </div>

      <div className={`mobile-bottom-safe fixed bottom-0 w-full min-w-0 px-3 sm:px-4 md:px-8 sm:pb-4 md:pb-8 pt-12 bg-gradient-to-t from-background via-background/95 to-transparent pointer-events-none z-40 transition-all duration-300 ${
        isSidebarCollapsed ? 'md:left-[72px] md:w-[calc(100%-72px)]' : 'md:left-[280px] md:w-[calc(100%-280px)]'
      }`}>
        <div className="w-full pointer-events-auto relative">
          {/* File Previews */}
          {attachedFiles.length > 0 && (
            <div className="max-w-3xl mx-auto mb-4 flex flex-wrap gap-3 overflow-x-auto pb-2 px-2 scrollbar-hide">
              {attachedFiles.map((file, idx) => (
                <div key={idx} className="relative group shrink-0">
                  <div className="w-20 h-20 rounded-2xl overflow-hidden border border-outline bg-surface-dim shadow-sm transition-all group-hover:shadow-md">
                    {file.type.startsWith("image/") ? (
                      <img
                        src={file.previewUrl}
                        className="w-full h-full object-cover"
                        alt="preview"
                      />
                    ) : file.type.startsWith("video/") ? (
                      <div className="w-full h-full flex items-center justify-center bg-black/5">
                        <Film size={24} className="text-primary opacity-40" />
                      </div>
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center p-2">
                        <FileText
                          size={24}
                          className="text-on-surface-variant mb-1"
                        />
                        <span className="text-[8px] truncate w-full text-center font-mono">
                          {file.name}
                        </span>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => removeFile(idx)}
                    className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-surface border border-outline shadow-sm flex items-center justify-center text-on-surface-variant hover:text-error transition-colors"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Plus Menu */}
          {isPlusMenuOpen && (
            <div className="max-w-[280px] absolute bottom-full left-0 mb-4 ml-0 md:ml-0 bg-surface border border-outline rounded-3xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-300">
              <div className="p-3 grid grid-cols-2 gap-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex flex-col items-center justify-center gap-2 p-4 rounded-2xl hover:bg-surface-dim transition-all group"
                >
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                    <Image size={20} />
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                    Gallery
                  </span>
                </button>
                <button
                  onClick={() => {
                    if (cameraInputRef.current) {
                      cameraInputRef.current.setAttribute(
                        "capture",
                        "environment",
                      );
                      cameraInputRef.current.click();
                    }
                  }}
                  className="flex flex-col items-center justify-center gap-2 p-4 rounded-2xl hover:bg-surface-dim transition-all group"
                >
                  <div className="w-10 h-10 rounded-full bg-secondary/10 flex items-center justify-center text-secondary group-hover:scale-110 transition-transform">
                    <Camera size={20} />
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                    Camera
                  </span>
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex flex-col items-center justify-center gap-2 p-4 rounded-2xl hover:bg-surface-dim transition-all group"
                >
                  <div className="w-10 h-10 rounded-full bg-on-surface-variant/10 flex items-center justify-center text-on-surface-variant group-hover:scale-110 transition-transform">
                    <FileText size={20} />
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                    Files
                  </span>
                </button>
                <button
                  onClick={() => {
                    setInputText(
                      (prev) =>
                        prev + (prev.trim() ? "\n" : "") + "/generate-image: ",
                    );
                    setIsPlusMenuOpen(false);
                  }}
                  className="flex flex-col items-center justify-center gap-2 p-4 rounded-2xl hover:bg-surface-dim transition-all group"
                >
                  <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-surface group-hover:scale-110 transition-transform shadow-sm">
                    <Sparkles size={20} />
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                    AI Gen
                  </span>
                </button>
              </div>
              <div className="p-3 border-t border-outline/30 bg-surface-dim flex items-center gap-3">
                <button className="flex items-center gap-2 px-3 py-2 rounded-xl bg-surface border border-outline text-[10px] uppercase font-bold tracking-widest text-on-surface-variant hover:text-primary transition-all">
                  <Video size={14} /> Video
                </button>
                <button className="flex items-center gap-2 px-3 py-2 rounded-xl bg-surface border border-outline text-[10px] uppercase font-bold tracking-widest text-on-surface-variant hover:text-primary transition-all">
                  <LayoutGrid size={14} /> More
                </button>
              </div>
            </div>
          )}

          {/* Hidden Inputs */}
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            multiple
            onChange={handleFileSelect}
            accept="image/*,video/*,.pdf,.doc,.docx,.txt"
          />
          <input
            type="file"
            ref={cameraInputRef}
            className="hidden"
            accept="image/*"
            onChange={handleFileSelect}
          />

          <div className="glass-input rounded-[28px] p-1 sm:p-1.5 flex flex-col shadow-sm transition-all duration-300 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/20 relative overflow-hidden group border border-outline bg-surface max-w-3xl mx-auto w-full">
            {/* Input Toolbar */}
            <div className="flex items-center gap-1 sm:gap-2 px-1 sm:px-2 py-1 border-b border-outline/20 mb-1">
              <button
                onClick={() => setIsPlusMenuOpen(!isPlusMenuOpen)}
                className={`p-1 sm:p-1.5 rounded-lg transition-all duration-200 cursor-pointer active:scale-90 ${isPlusMenuOpen ? "bg-primary text-on-primary shadow-sm scale-110" : "text-on-surface-variant hover:text-primary hover:bg-surface-dim"}`}
              >
                <PlusCircle size={18} />
              </button>
              <div className="h-4 w-px bg-outline/30 mx-1"></div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsThinkingMode?.(!isThinkingMode)}
                  className={`flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-200 ${isThinkingMode ? "bg-primary/10 text-primary shadow-sm ring-1 ring-primary/20" : "text-on-surface-variant hover:bg-surface-dim hover:text-primary"}`}
                  title={safeLanguage === 'en' ? "Deep Thinking" : "Berpikir Mendalam"}
                >
                  <BrainCircuit size={16} />
                </button>

                <button
                  onClick={() => setIsSearchMode?.(!isSearchMode)}
                  className={`flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-200 ${isSearchMode ? "bg-blue-500/10 text-blue-500 shadow-sm ring-1 ring-blue-500/20" : "text-on-surface-variant hover:bg-surface-dim hover:text-primary"}`}
                  title={t.toggleSearch}
                >
                  <Globe size={16} />
                </button>

                {/* Token Usage Display */}
                {tokenUsage.total > 0 && (
                  <div className="flex items-center gap-1.5 px-2 py-1 bg-surface-dim/80 rounded-lg border border-outline/30">
                    <span className={`text-[9px] font-mono font-semibold tabular-nums ${
                      (tokenUsage.total / contextWindow) > 0.9
                        ? 'text-red-500'
                        : (tokenUsage.total / contextWindow) > 0.7
                        ? 'text-yellow-500'
                        : 'text-on-surface-variant'
                    }`}>
                      {formatTokenCount(tokenUsage.total)}/{formatTokenCount(contextWindow)}
                    </span>
                    <div className="w-8 h-1.5 bg-surface-dim rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          (tokenUsage.total / contextWindow) > 0.9
                            ? 'bg-red-500'
                            : (tokenUsage.total / contextWindow) > 0.7
                            ? 'bg-yellow-500'
                            : 'bg-primary'
                        }`}
                        style={{
                          width: `${Math.min((tokenUsage.total / contextWindow) * 100, 100)}%`
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-end gap-1 sm:gap-2 px-1">
              <textarea
                ref={textareaRef}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                className="flex-1 bg-transparent border-none outline-none text-on-surface font-body text-sm placeholder-on-surface-variant focus:ring-0 resize-none py-3 px-2 sm:px-3 overflow-y-auto min-h-[44px] leading-relaxed scrollbar-hide"
                placeholder={t.placeholder}
                rows={1}
                style={{ maxHeight: Math.min(window.innerHeight * 0.35, 200) + 'px' }}
              ></textarea>

              <div className="flex items-center gap-0.5 sm:gap-1 pb-1.5 pr-1 shrink-0">
                <button 
                  onClick={toggleRecording}
                  className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center transition-all duration-200 ${isRecording ? "bg-red-500 text-white animate-pulse" : "text-on-surface-variant hover:text-primary hover:bg-surface-dim"}`}
                >
                  {isRecording ? <Square size={14} className="fill-current" /> : <Mic size={18} />}
                </button>
                <button
                  onClick={
                    isGenerating
                      ? handleStop
                      : inputText.trim() || attachedFiles.length > 0
                        ? handleSend
                        : () => setIsLiveActive(true)
                  }
                  className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center transition-all duration-200 shadow-md shrink-0 ${!inputText.trim() && attachedFiles.length === 0 && !isGenerating ? "bg-secondary text-on-secondary hover:bg-secondary/90" : "bg-primary text-on-primary hover:opacity-90 disabled:opacity-50"}`}
                  disabled={isGenerating && isCanceled.current}
                >
                  {isGenerating ? (
                    <Square size={14} className="fill-current" />
                  ) : inputText.trim() || attachedFiles.length > 0 ? (
                    <ArrowUp size={18} strokeWidth={3} />
                  ) : (
                    <Waves size={18} />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
