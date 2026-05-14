import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  MessageSquarePlus, History, Database, Brain, Trash2,
  Settings, HelpCircle, ChevronLeft, ChevronRight, Sparkles, X, MessageSquare, Pin, Edit2, LogOut, ChevronDown, MoreHorizontal, TrendingUp
} from 'lucide-react';
import { Session, Memory } from '../App';
import { translations, Language, normalizeLanguage } from '../translations';

interface SidebarProps {
  isCollapsed: boolean;
  setIsCollapsed: (val: boolean) => void;
  isOpenMobile: boolean;
  setIsOpenMobile: (val: boolean) => void;
  currentView: 'chat' | 'settings' | 'tokenUsage';
  setCurrentView: (val: 'chat' | 'settings' | 'tokenUsage') => void;
  sessions: Session[];
  currentSessionId: string;
  setCurrentSessionId: (id: string) => void;
  createSession: () => void;
  deleteSession: (id: string, e: React.MouseEvent) => void;
  pinSession: (id: string, e: React.MouseEvent) => void;
  renameSession: (id: string, title: string) => void;
  clearAll: () => void;
  userName: string;
  onSignOut: () => void;
  language: Language;
  memories: Memory[];
  deleteMemory: (id: string) => void;
  updateMemory: (id: string, content: string) => void;
}

export function Sidebar({ 
  isCollapsed, setIsCollapsed, isOpenMobile, setIsOpenMobile, 
  currentView, setCurrentView, sessions, currentSessionId, setCurrentSessionId, 
  createSession, deleteSession, pinSession, renameSession, clearAll, userName,
  onSignOut, language, memories, deleteMemory, updateMemory
}: SidebarProps) {
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const t = translations[normalizeLanguage(language)].sidebar;
  const [editTitle, setEditTitle] = useState('');
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
  const [isConfirmingClearAll, setIsConfirmingClearAll] = useState(false);
  const [isMemoryOpen, setIsMemoryOpen] = useState(false);
  const [editingMemoryId, setEditingMemoryId] = useState<string | null>(null);
  const [editMemoryContent, setEditMemoryContent] = useState('');

  const sidebarContent = (
    <>
      <div className="absolute -right-4 top-1/2 -translate-y-1/2 z-20 hidden md:block">
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="w-8 h-8 bg-surface border border-primary rounded-full flex items-center justify-center hover:bg-primary hover:text-surface transition-colors shadow-sm group outline-none"
        >
          {isCollapsed ? 
             <ChevronRight size={16} className="text-primary group-hover:text-surface" /> : 
             <ChevronLeft size={16} className="text-primary group-hover:text-surface" />
          }
        </button>
      </div>
      
      <div className="md:hidden absolute top-6 right-6 z-20">
        <button onClick={() => setIsOpenMobile(false)} className="p-2 text-on-surface-variant hover:text-primary">
          <X size={20} />
        </button>
      </div>

      <div className={`mb-8 flex ${(isCollapsed && !isOpenMobile) ? 'justify-center px-0' : 'px-6'} items-center gap-3 overflow-hidden pt-6 md:pt-0 shrink-0`}>
        {(!isCollapsed || isOpenMobile) && (
          <div className="flex flex-col whitespace-nowrap overflow-hidden pl-2">
            <h1 className="font-display text-2xl font-bold tracking-tighter leading-none text-primary italic">Adoetz Chat</h1>
          </div>
        )}
        {(isCollapsed && !isOpenMobile) && (
           <div className="w-10 h-10 rounded-2xl bg-primary flex items-center justify-center text-surface font-display text-xl font-bold italic shadow-lg shadow-primary/20">A</div>
        )}
      </div>

      <div className="flex flex-col flex-1 overflow-hidden">
        <ul className={`flex flex-col gap-2 font-body text-sm ${isCollapsed ? 'px-3' : 'px-6'} mb-6 shrink-0`}>
          <li>
            <a 
              href="#" 
              onClick={(e) => {
                e.preventDefault();
                createSession();
              }}
              className={`flex items-center gap-3 p-3 rounded-2xl transition-all duration-200 active:scale-95 whitespace-nowrap overflow-hidden text-surface bg-primary shadow-sm font-medium hover:opacity-90 ${isCollapsed ? 'justify-center' : ''}`}
            >
              <MessageSquarePlus size={18} className="shrink-0" />
              {(!isCollapsed || isOpenMobile) && <span>{t.newSession}</span>}
            </a>
          </li>
        </ul>
        
        {/* Memories Section */}
        <div className={`mt-6 ${isCollapsed ? 'px-3' : 'px-6'}`}>
          <button 
            onClick={() => setIsMemoryOpen(!isMemoryOpen)}
            className={`w-full flex items-center justify-between p-2 rounded-2xl transition-all hover:bg-surface-dim group ${isMemoryOpen ? 'bg-surface-dim' : ''}`}
          >
            <div className="flex items-center gap-2">
              <Brain size={16} className={`transition-colors ${isMemoryOpen ? 'text-primary' : 'text-on-surface-variant'}`} />
              {(!isCollapsed || isOpenMobile) && (
                <span className="text-[10px] uppercase tracking-[0.2em] text-on-surface-variant font-bold leading-none">
                  {t.memory}
                </span>
              )}
            </div>
            {(!isCollapsed || isOpenMobile) && (
              <ChevronDown 
                size={14} 
                className={`text-on-surface-variant transition-transform duration-300 ${isMemoryOpen ? 'rotate-180' : ''}`} 
              />
            )}
          </button>
          
          <AnimatePresence>
            {isMemoryOpen && (
              <motion.div 
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="flex flex-col gap-2 pt-2 pb-4 max-h-[300px] overflow-y-auto scrollbar-hide">
                  {memories.length === 0 ? (
                    (!isCollapsed || isOpenMobile) && (
                      <div className="px-2 py-4 text-center text-[10px] text-on-surface-variant/40 italic font-body">
                        {t.noMemories}
                      </div>
                    )
                  ) : (
                    memories.map((memory) => (
                      <div 
                        key={memory.id} 
                        className="group relative bg-surface-dim/40 border border-outline/20 rounded-xl p-2.5 transition-all hover:border-primary/20"
                      >
                        {editingMemoryId === memory.id ? (
                          <div className="space-y-2">
                            <textarea
                              value={editMemoryContent}
                              onChange={(e) => setEditMemoryContent(e.target.value)}
                              className="w-full bg-surface border border-primary/30 rounded-lg p-2 text-[11px] font-body text-on-surface focus:outline-none min-h-[60px] resize-none"
                              autoFocus
                            />
                            <div className="flex gap-1">
                              <button
                                onClick={() => {
                                  updateMemory(memory.id, editMemoryContent);
                                  setEditingMemoryId(null);
                                }}
                                className="flex-1 bg-primary text-surface text-[9px] font-bold py-1.5 rounded-lg"
                              >
                                {t.save}
                              </button>
                              <button
                                onClick={() => setEditingMemoryId(null)}
                                className="flex-1 bg-surface border border-outline text-on-surface text-[9px] font-bold py-1.5 rounded-lg"
                              >
                                {t.cancel}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <p className={`text-[11px] leading-relaxed text-on-surface-variant/90 font-body ${isCollapsed && !isOpenMobile ? 'hidden' : 'line-clamp-3'}`}>
                              {memory.content}
                            </p>
                            <div className={`flex items-center justify-between mt-2 ${isCollapsed && !isOpenMobile ? 'hidden' : ''}`}>
                              <span className="text-[8px] text-on-surface-variant/40 font-mono">
                                {new Date(memory.timestamp).toLocaleDateString()}
                              </span>
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                                <button 
                                  onClick={() => {
                                    setEditingMemoryId(memory.id);
                                    setEditMemoryContent(memory.content);
                                  }}
                                  className="p-1 text-on-surface-variant/40 hover:text-primary transition-all"
                                >
                                  <Edit2 size={10} />
                                </button>
                                <button 
                                  onClick={() => deleteMemory(memory.id)}
                                  className="p-1 text-on-surface-variant/40 hover:text-error transition-all"
                                >
                                  <Trash2 size={10} />
                                </button>
                              </div>
                            </div>
                            {isCollapsed && !isOpenMobile && (
                              <div className="flex justify-center py-1">
                                <Brain size={16} className="text-primary/40" />
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className={`flex-1 overflow-y-auto ${isCollapsed ? 'px-3' : 'px-6'} scrollbar-hide py-2`}>
          {(!isCollapsed || isOpenMobile) && (
             <div className="text-[10px] uppercase tracking-[0.2em] text-on-surface-variant font-semibold pl-2 mb-3">{t.recentSessions}</div>
          )}
          <ul className={`flex flex-col gap-1 font-body text-sm`}>
            {sessions.sort((a,b) => {
              if (a.pinned && !b.pinned) return -1;
              if (!a.pinned && b.pinned) return 1;
              return b.updatedAt - a.updatedAt;
            }).map((session) => {
              const isActive = currentView === 'chat' && currentSessionId === session.id;
              const isEditing = editingSessionId === session.id;

              return (
                <li key={session.id}>
                  <div className={`flex items-center justify-between p-3 rounded-2xl transition-all duration-200 group ${isActive ? 'bg-surface-dim font-medium text-primary' : 'text-on-surface-variant hover:text-primary hover:bg-surface-dim'} ${isCollapsed ? 'justify-center' : ''}`}>
                    <div 
                      className="flex items-center gap-3 overflow-hidden flex-1 cursor-pointer"
                      onClick={() => {
                        if (isEditing) return;
                        setCurrentView('chat');
                        setCurrentSessionId(session.id);
                        setIsOpenMobile(false);
                      }}
                      title={isCollapsed ? session.title : ''}
                    >
                      <MessageSquare size={16} className={`shrink-0 ${isActive ? 'opacity-100 text-primary' : 'opacity-70'}`} />
                      {(!isCollapsed || isOpenMobile) && (
                        isEditing ? (
                          <input 
                            autoFocus
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            onBlur={() => { renameSession(session.id, editTitle || session.title); setEditingSessionId(null); }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                renameSession(session.id, editTitle || session.title);
                                setEditingSessionId(null);
                              } else if (e.key === 'Escape') {
                                setEditingSessionId(null);
                              }
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="w-full bg-transparent border-none outline-none text-sm font-body focus:ring-0 p-0 text-primary"
                          />
                        ) : (
                          <span className="truncate">{session.title}</span>
                        )
                      )}
                    </div>
                    {(!isCollapsed || isOpenMobile) && !isEditing && (
                      <div className={`flex items-center text-on-surface-variant opacity-0 group-hover:opacity-100 ${isActive || session.pinned || deletingSessionId === session.id || activeMenuId === session.id ? 'opacity-100' : ''}`}>
                         {deletingSessionId === session.id ? (
                           <div className="flex items-center bg-error rounded-xl overflow-hidden shadow-lg animate-in fade-in zoom-in duration-200">
                             <button 
                               onClick={(e) => { e.stopPropagation(); deleteSession(session.id, e); setDeletingSessionId(null); activeMenuId && setActiveMenuId(null); }}
                               className="px-2 py-1.5 text-surface text-[10px] font-bold hover:bg-black/10 transition-colors uppercase tracking-tight"
                             >
                               {t.delete}
                             </button>
                             <button 
                               onClick={(e) => { e.stopPropagation(); setDeletingSessionId(null); }}
                               className="p-1.5 text-surface/70 hover:text-surface transition-colors border-l border-surface/20"
                             >
                               <X size={10} />
                             </button>
                           </div>
                         ) : (
                           <div className="relative">
                              {session.pinned && activeMenuId !== session.id && (
                                <span className="mr-1 inline-block"><Pin size={10} className="fill-current text-primary" /></span>
                              )}
                              <button 
                                onClick={(e) => { e.stopPropagation(); setActiveMenuId(activeMenuId === session.id ? null : session.id); }}
                                className={`hover:text-primary transition-colors p-1.5 rounded-xl hover:bg-surface ${activeMenuId === session.id ? 'bg-surface text-primary shadow-sm' : ''}`}
                              >
                                <MoreHorizontal size={14} />
                              </button>
                              
                              <AnimatePresence>
                                {activeMenuId === session.id && (
                                  <>
                                    <div 
                                      className="fixed inset-0 z-40" 
                                      onClick={(e) => { e.stopPropagation(); setActiveMenuId(null); }}
                                    ></div>
                                    <motion.div
                                      initial={{ opacity: 0, scale: 0.95, y: -5 }}
                                      animate={{ opacity: 1, scale: 1, y: 0 }}
                                      exit={{ opacity: 0, scale: 0.95, y: -5 }}
                                      transition={{ duration: 0.15 }}
                                      className="absolute right-0 top-full mt-1 w-32 bg-surface shadow-lg border border-outline rounded-xl overflow-hidden z-50 text-sm"
                                    >
                                      <button 
                                        onClick={(e) => { e.stopPropagation(); pinSession(session.id, e); setActiveMenuId(null); }}
                                        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-surface-dim transition-colors"
                                      >
                                        <Pin size={14} className={session.pinned ? 'fill-current text-primary' : 'text-on-surface-variant'} />
                                        <span className={session.pinned ? 'text-primary' : 'text-on-surface-variant'}>{t.pin}</span>
                                      </button>
                                      <button 
                                        onClick={(e) => { e.stopPropagation(); setEditingSessionId(session.id); setEditTitle(session.title); setActiveMenuId(null); }}
                                        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-surface-dim transition-colors text-on-surface-variant"
                                      >
                                        <Edit2 size={14} />
                                        <span>{t.rename}</span>
                                      </button>
                                      <button 
                                        onClick={(e) => { e.stopPropagation(); setDeletingSessionId(session.id); setActiveMenuId(null); }}
                                        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-error/10 transition-colors text-error"
                                      >
                                        <Trash2 size={14} />
                                        <span>{t.delete}</span>
                                      </button>
                                    </motion.div>
                                  </>
                                )}
                              </AnimatePresence>
                           </div>
                         )}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
        
        <ul className={`flex flex-col gap-2 font-body text-sm ${isCollapsed ? 'px-3' : 'px-6'} mt-4 shrink-0`}>
          <li>
            {(!isCollapsed || isOpenMobile) && (
               <div className="text-[10px] uppercase tracking-[0.2em] text-on-surface-variant font-semibold pl-2 mb-2 mt-4">{t.system}</div>
            )}
            {isConfirmingClearAll ? (
              <div className={`p-4 bg-error/5 border border-error/20 rounded-2xl animate-in zoom-in-95 duration-200 ${isCollapsed && !isOpenMobile ? 'p-2' : ''}`}>
                {!isCollapsed || isOpenMobile ? (
                  <>
                    <div className="text-[11px] font-bold text-error uppercase tracking-widest mb-3 text-center">{t.confirmClear}</div>
                    <div className="flex flex-col gap-2">
                       <button 
                         onClick={(e) => { e.preventDefault(); e.stopPropagation(); clearAll(); setIsConfirmingClearAll(false); }}
                         className="w-full bg-error text-white py-2.5 rounded-xl text-[10px] font-bold hover:bg-error/90 transition-all uppercase tracking-[0.1em] shadow-sm shadow-error/20"
                       >
                         {t.yesClear}
                       </button>
                       <button 
                         onClick={(e) => { e.preventDefault(); e.stopPropagation(); setIsConfirmingClearAll(false); }}
                         className="w-full bg-surface-dim border border-outline text-on-surface py-2.5 rounded-xl text-[10px] font-bold hover:bg-surface transition-colors uppercase tracking-[0.1em]"
                       >
                         {t.cancel}
                       </button>
                    </div>
                  </>
                ) : (
                  <button 
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); clearAll(); setIsConfirmingClearAll(false); }}
                    className="w-10 h-10 bg-error text-white rounded-xl flex items-center justify-center active:scale-95 transition-transform mx-auto shadow-lg shadow-error/20"
                    title={t.clearAll}
                  >
                    <Trash2 size={18} />
                  </button>
                )}
              </div>
            ) : (
              <a 
                href="#" 
                onClick={(e) => { e.preventDefault(); setIsConfirmingClearAll(true); }} 
                className={`flex items-center gap-3 p-3 text-on-surface-variant hover:text-error hover:bg-error/5 transition-colors duration-200 rounded-2xl active:scale-95 whitespace-nowrap overflow-hidden ${isCollapsed && !isOpenMobile ? 'justify-center px-0' : ''}`}
                title={(isCollapsed && !isOpenMobile) ? t.clearAll : ""}
              >
                <Trash2 size={18} className="shrink-0" />
                {(!isCollapsed || isOpenMobile) && <span>{t.clearAll}</span>}
              </a>
            )}
          </li>
        </ul>

      </div>

      <div className={`mt-auto flex flex-col gap-1 font-body text-sm ${isCollapsed ? 'px-3' : 'px-6'} pb-1 shrink-0 md:mb-1`}>
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setCurrentView('settings');
            setIsOpenMobile(false);
          }}
          className={`flex items-center gap-3 p-3 transition-colors duration-200 rounded-2xl active:scale-95 whitespace-nowrap overflow-hidden ${currentView === 'settings' ? 'text-primary bg-surface-dim font-medium' : 'text-on-surface-variant hover:text-primary hover:bg-surface-dim'} ${isCollapsed ? 'justify-center' : ''}`}
          title={isCollapsed ? t.preferences : ""}
        >
          <Settings size={18} className="shrink-0" />
          {(!isCollapsed || isOpenMobile) && <span>{t.preferences}</span>}
        </a>

        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setCurrentView('tokenUsage');
            setIsOpenMobile(false);
          }}
          className={`flex items-center gap-3 p-3 transition-colors duration-200 rounded-2xl active:scale-95 whitespace-nowrap overflow-hidden ${currentView === 'tokenUsage' ? 'text-primary bg-surface-dim font-medium' : 'text-on-surface-variant hover:text-primary hover:bg-surface-dim'} ${isCollapsed ? 'justify-center' : ''}`}
          title={isCollapsed ? "Token Usage" : ""}
        >
          <TrendingUp size={18} className="shrink-0" />
          {(!isCollapsed || isOpenMobile) && <span>Token Usage</span>}
        </a>
      </div>
      
      {(!isCollapsed || isOpenMobile) && (
        <div className="mt-1 mx-6 p-2 bg-secondary/5 border border-outline/20 rounded-[24px] shrink-0 mb-4 group/user relative overflow-hidden transition-all hover:border-primary/20">
          <div className="absolute top-0 right-0 w-12 h-12 bg-primary/2 rounded-full -mr-4 -mt-4" />
          
          <div className="flex items-center justify-between relative z-10 px-1">
            <div className="flex items-center gap-2 overflow-hidden">
              <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold text-[9px] shrink-0 border border-primary/10">
                {userName.charAt(0).toUpperCase()}
              </div>
              <div className="flex flex-col min-w-0">
                <div className="text-[10px] font-bold text-on-surface truncate pr-1 leading-tight">{userName}</div>
                <div className="text-[7px] text-on-surface-variant uppercase tracking-[0.05em] font-semibold opacity-40 leading-none">{t.verifiedUser}</div>
              </div>
            </div>
            <button 
              className="p-1 text-on-surface-variant hover:text-error transition-colors rounded-md hover:bg-error/5"
              title={t.signOut}
              onClick={() => {
                if (window.confirm(t.signOutConfirm)) {
                  onSignOut();
                }
              }}
            >
              <LogOut size={12} />
            </button>
          </div>
        </div>
      )}
      {(isCollapsed && !isOpenMobile) && (
        <div className="mt-auto mb-8 flex justify-center hidden md:flex shrink-0">
           <div className="w-9 h-9 rounded-2xl bg-primary/10 flex items-center justify-center text-primary font-bold text-xs cursor-pointer hover:bg-primary/20 transition-all border border-primary/20">
              {userName.charAt(0).toUpperCase()}
           </div>
        </div>
      )}
    </>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <motion.nav
        initial={false}
        animate={{ width: isCollapsed ? 72 : 280 }}
        className="hidden md:flex flex-col py-8 bg-surface border-y-0 border-l-0 border-r border-outline shadow-sm relative z-10 rounded-r-[40px] h-full transition-colors shrink-0"
      >
        {sidebarContent}
      </motion.nav>

      {/* Mobile Sidebar */}
      <AnimatePresence>
        {isOpenMobile && (
          <motion.nav
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="mobile-sidebar md:hidden fixed inset-y-0 left-0 w-[85vw] max-w-[320px] flex flex-col bg-surface border-r border-outline shadow-2xl z-50 rounded-r-[40px] h-full overflow-y-auto"
          >
            {sidebarContent}
          </motion.nav>
        )}
      </AnimatePresence>
    </>
  );
}
