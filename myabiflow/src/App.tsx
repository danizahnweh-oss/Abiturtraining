/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { GoogleGenAI } from "@google/genai";
import { 
  BookOpen, 
  Languages, 
  History, 
  Scale, 
  TrendingUp, 
  Heart, 
  Globe, 
  ScrollText, 
  Calculator, 
  FlaskConical, 
  Atom, 
  Dna,
  ChevronRight,
  LayoutDashboard,
  User,
  LogOut,
  Search,
  Bell,
  Sparkles,
  GraduationCap,
  PenTool,
  MessageSquare,
  Zap,
  Leaf,
  Landmark,
  Gavel,
  BarChart3,
  Map,
  Library,
  Sigma,
  Scroll,
  Globe2,
  Compass,
  Send,
  X,
  Bot
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface Subject {
  id: string;
  name: string;
  icon: React.ReactNode;
  color: string;
  category: 'Sprachen' | 'Geisteswissenschaften' | 'MINT' | 'Sonstiges';
}

const subjects: Subject[] = [
  { id: 'deutsch', name: 'Deutsch', icon: <span className="text-2xl">🇩🇪</span>, color: 'bg-blue-600', category: 'Geisteswissenschaften' },
  { id: 'englisch', name: 'Englisch', icon: <span className="text-2xl">🇺🇸</span>, color: 'bg-indigo-600', category: 'Sprachen' },
  { id: 'französisch', name: 'Französisch', icon: <span className="text-2xl">🇫🇷</span>, color: 'bg-cyan-600', category: 'Sprachen' },
  { id: 'italienisch', name: 'Italienisch', icon: <span className="text-2xl">🇮🇹</span>, color: 'bg-teal-600', category: 'Sprachen' },
  { id: 'latein', name: 'Latein', icon: <span className="text-2xl">🏛️</span>, color: 'bg-stone-600', category: 'Sprachen' },
  { id: 'mathematik', name: 'Mathematik', icon: <Sigma className="w-6 h-6" />, color: 'bg-rose-600', category: 'MINT' },
  { id: 'physik', name: 'Physik', icon: <Zap className="w-6 h-6" />, color: 'bg-amber-500', category: 'MINT' },
  { id: 'chemie', name: 'Chemie', icon: <FlaskConical className="w-6 h-6" />, color: 'bg-emerald-600', category: 'MINT' },
  { id: 'biologie', name: 'Biologie', icon: <Leaf className="w-6 h-6" />, color: 'bg-green-600', category: 'MINT' },
  { id: 'geschichte', name: 'Geschichte', icon: <Landmark className="w-6 h-6" />, color: 'bg-orange-700', category: 'Geisteswissenschaften' },
  { id: 'politik', name: 'Politik & Gesellschaft', icon: <Gavel className="w-6 h-6" />, color: 'bg-orange-600', category: 'Geisteswissenschaften' },
  { id: 'wirtschaft', name: 'Wirtschaft & Recht', icon: <BarChart3 className="w-6 h-6" />, color: 'bg-slate-700', category: 'Geisteswissenschaften' },
  { id: 'geographie', name: 'Geographie', icon: <Compass className="w-6 h-6" />, color: 'bg-sky-700', category: 'Geisteswissenschaften' },
  { id: 'ethik', name: 'Ethik', icon: <Heart className="w-6 h-6" />, color: 'bg-pink-600', category: 'Sonstiges' },
];

export default function App() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'bot', text: string }[]>([
    { role: 'bot', text: 'Hallo! Ich bin dein myAbiFlow KI-Assistent. Wie kann ich dir heute bei deiner Abiturvorbereitung helfen?' }
  ]);
  const [userInput, setUserInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  const handleSendMessage = async () => {
    if (!userInput.trim()) return;

    const newMessages = [...chatMessages, { role: 'user' as const, text: userInput }];
    setChatMessages(newMessages);
    setUserInput('');
    setIsTyping(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: userInput,
        config: {
          systemInstruction: "Du bist der myAbiFlow KI-Assistent. Deine Aufgabe ist es, Schülern bei der Vorbereitung auf das Abitur in Deutschland zu helfen. Sei motivierend, präzise und hilfreich. Beantworte Fragen zu verschiedenen Schulfächern, Lernstrategien und Prüfungsmodalitäten.",
        },
      });

      setChatMessages([...newMessages, { role: 'bot', text: response.text || "Entschuldigung, ich konnte keine Antwort generieren." }]);
    } catch (error) {
      console.error("Chat error:", error);
      setChatMessages([...newMessages, { role: 'bot', text: "Es gab ein Problem bei der Verbindung zum KI-Server. Bitte versuche es später erneut." }]);
    } finally {
      setIsTyping(false);
    }
  };

  const filteredSubjects = subjects.filter(s => 
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
    (!selectedCategory || s.category === selectedCategory)
  );

  const categories = Array.from(new Set(subjects.map(s => s.category)));

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-slate-900 font-sans">
      {/* Sidebar - Desktop */}
      <aside className="fixed left-0 top-0 h-full w-64 bg-white border-r border-slate-200 hidden lg:flex flex-col p-6 z-20">
        <div className="flex items-center gap-3 mb-12">
          <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-indigo-200 rotate-3 group hover:rotate-0 transition-transform">
            <GraduationCap className="w-7 h-7" />
          </div>
          <span className="text-2xl font-black tracking-tighter text-slate-900">my<span className="text-indigo-600">Abi</span>Flow</span>
        </div>

        <nav className="flex-1 space-y-1">
          <button className="w-full flex items-center gap-3 px-4 py-3 text-indigo-600 bg-indigo-50 rounded-xl font-medium transition-all">
            <LayoutDashboard className="w-5 h-5" />
            <span>Dashboard</span>
          </button>
          <button className="w-full flex items-center gap-3 px-4 py-3 text-slate-500 hover:bg-slate-50 rounded-xl font-medium transition-all">
            <Sparkles className="w-5 h-5" />
            <span>KI-Trainer</span>
          </button>
          <button className="w-full flex items-center gap-3 px-4 py-3 text-slate-500 hover:bg-slate-50 rounded-xl font-medium transition-all">
            <History className="w-5 h-5" />
            <span>Verlauf</span>
          </button>
        </nav>

        <div className="mt-auto pt-6 border-t border-slate-100">
          <button className="w-full flex items-center gap-3 px-4 py-3 text-slate-500 hover:bg-slate-50 rounded-xl font-medium transition-all">
            <User className="w-5 h-5" />
            <span>Profil</span>
          </button>
          <button className="w-full flex items-center gap-3 px-4 py-3 text-rose-500 hover:bg-rose-50 rounded-xl font-medium transition-all mt-1">
            <LogOut className="w-5 h-5" />
            <span>Abmelden</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="lg:ml-64 min-h-screen">
        {/* Header */}
        <header className="sticky top-0 bg-white/80 backdrop-blur-md border-bottom border-slate-200 px-6 py-4 flex items-center justify-between z-10">
          <div className="flex-1 max-w-xl relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Suche nach einem Fach..." 
              className="w-full pl-10 pr-4 py-2 bg-slate-100 border-none rounded-full text-sm focus:ring-2 focus:ring-indigo-500 transition-all"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-4 ml-4">
            <button className="p-2 text-slate-500 hover:bg-slate-100 rounded-full transition-all relative">
              <Bell className="w-5 h-5" />
              <span className="absolute top-2 right-2 w-2 h-2 bg-rose-500 rounded-full border-2 border-white"></span>
            </button>
            <div className="hidden sm:flex items-center gap-3 pl-4 border-l border-slate-200">
              <div className="text-right">
                <p className="text-xs font-semibold text-slate-900 leading-none">Max Mustermann</p>
              </div>
              <div className="w-9 h-9 bg-slate-200 rounded-full overflow-hidden">
                <img src="https://picsum.photos/seed/user1/100/100" alt="User" referrerPolicy="no-referrer" />
              </div>
            </div>
          </div>
        </header>

        <div className="p-6 lg:p-10 max-w-6xl mx-auto">
          {/* Hero / Welcome */}
          <section className="mb-12">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-indigo-600 rounded-3xl p-8 lg:p-12 text-white relative overflow-hidden shadow-2xl shadow-indigo-200"
            >
              <div className="relative z-10">
                <h1 className="text-3xl lg:text-4xl font-bold mb-4">Willkommen zurück, Max! 👋</h1>
                <p className="text-indigo-100 text-lg max-w-lg mb-8">
                  Dein Abitur rückt näher. Welches Fach möchtest du heute meistern? 
                  Deine KI-Trainer stehen bereit.
                </p>
                <div className="flex flex-wrap gap-4">
                  <button className="px-6 py-3 bg-white text-indigo-600 rounded-xl font-bold hover:bg-indigo-50 transition-all flex items-center gap-2">
                    Letzte Aufgabe fortsetzen
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
              
              {/* Decorative elements */}
              <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-20 -mt-20 blur-3xl"></div>
              <div className="absolute bottom-0 left-1/2 w-96 h-96 bg-indigo-400/20 rounded-full -ml-48 -mb-48 blur-3xl"></div>
            </motion.div>
          </section>

          {/* Filters */}
          <div className="mb-8 flex flex-wrap items-center gap-3">
            <button 
              onClick={() => setSelectedCategory(null)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${!selectedCategory ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300'}`}
            >
              Alle Fächer
            </button>
            {categories.map(cat => (
              <button 
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${selectedCategory === cat ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300'}`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Subject Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            <AnimatePresence mode="popLayout">
              {filteredSubjects.map((subject, index) => (
                <motion.div
                  key={subject.id}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ delay: index * 0.05 }}
                  className="group bg-white rounded-2xl p-6 border border-slate-200 hover:border-indigo-300 hover:shadow-xl hover:shadow-indigo-500/5 transition-all cursor-pointer relative overflow-hidden"
                >
                  <div className={`w-12 h-12 ${subject.color} rounded-xl flex items-center justify-center text-white mb-4 group-hover:scale-110 transition-transform`}>
                    {subject.icon}
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 mb-1">{subject.name}</h3>
                  <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-4">{subject.category}</p>
                  
                  <div className="flex items-center justify-between mt-auto">
                    <div className="flex -space-x-2">
                      {[1, 2, 3].map(i => (
                        <div key={i} className="w-6 h-6 rounded-full border-2 border-white bg-slate-100 overflow-hidden">
                          <img src={`https://picsum.photos/seed/user${i+index}/50/50`} alt="User" referrerPolicy="no-referrer" />
                        </div>
                      ))}
                      <div className="w-6 h-6 rounded-full border-2 border-white bg-slate-100 flex items-center justify-center text-[8px] font-bold text-slate-500">
                        +12
                      </div>
                    </div>
                    <span className="text-xs font-bold text-indigo-600 group-hover:translate-x-1 transition-transform flex items-center gap-1">
                      Starten <ChevronRight className="w-3 h-3" />
                    </span>
                  </div>

                  {/* Hover effect background */}
                  <div className="absolute top-0 right-0 w-24 h-24 bg-slate-50 rounded-full -mr-12 -mt-12 group-hover:bg-indigo-50 transition-colors -z-10"></div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          {/* Empty State */}
          {filteredSubjects.length === 0 && (
            <div className="py-20 text-center">
              <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <Search className="w-8 h-8 text-slate-400" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">Keine Fächer gefunden</h3>
              <p className="text-slate-500">Versuche es mit einem anderen Suchbegriff oder Filter.</p>
            </div>
          )}

          {/* Footer Info */}
          <footer className="mt-20 pt-10 border-t border-slate-200 flex flex-col md:flex-row items-center justify-between gap-6 text-slate-500 text-sm">
            <div className="flex items-center gap-6">
              <a href="#" className="hover:text-indigo-600 transition-colors">Impressum</a>
              <a href="#" className="hover:text-indigo-600 transition-colors">Datenschutz</a>
              <a href="#" className="hover:text-indigo-600 transition-colors">Kontakt</a>
              <a href="https://myabiflow.de" className="text-slate-400 hover:text-indigo-600 transition-colors flex items-center gap-1">
                Lehrer-Dashboard <ChevronRight className="w-3 h-3" />
              </a>
            </div>
            <p>© 2026 myAbiFlow. Alle Rechte vorbehalten.</p>
          </footer>
        </div>
      </main>
      {/* Chatbot Widget */}
      <div className="fixed bottom-6 right-6 z-50">
        <AnimatePresence>
          {isChatOpen && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="absolute bottom-20 right-0 w-[380px] h-[500px] bg-white rounded-3xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden"
            >
              {/* Chat Header */}
              <div className="p-4 bg-indigo-600 text-white flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                    <Bot className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="font-bold text-sm">myAbiFlow KI</p>
                    <p className="text-[10px] text-indigo-100 uppercase tracking-widest font-bold">Online</p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsChatOpen(false)}
                  className="p-2 hover:bg-white/10 rounded-full transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Chat Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50">
                {chatMessages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] p-3 rounded-2xl text-sm ${
                      msg.role === 'user' 
                        ? 'bg-indigo-600 text-white rounded-tr-none shadow-md shadow-indigo-100' 
                        : 'bg-white text-slate-700 border border-slate-200 rounded-tl-none shadow-sm'
                    }`}>
                      {msg.text}
                    </div>
                  </div>
                ))}
                {isTyping && (
                  <div className="flex justify-start">
                    <div className="bg-white border border-slate-200 p-3 rounded-2xl rounded-tl-none flex gap-1">
                      <span className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce"></span>
                      <span className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce [animation-delay:0.2s]"></span>
                      <span className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce [animation-delay:0.4s]"></span>
                    </div>
                  </div>
                )}
              </div>

              {/* Chat Input */}
              <div className="p-4 bg-white border-t border-slate-100 flex gap-2">
                <input 
                  type="text" 
                  placeholder="Frag mich etwas..."
                  className="flex-1 bg-slate-100 border-none rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 transition-all"
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                />
                <button 
                  onClick={handleSendMessage}
                  disabled={!userInput.trim() || isTyping}
                  className="p-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-all"
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <button 
          onClick={() => setIsChatOpen(!isChatOpen)}
          className="w-14 h-14 bg-indigo-600 text-white rounded-full shadow-2xl shadow-indigo-300 flex items-center justify-center hover:scale-110 active:scale-95 transition-all group"
        >
          {isChatOpen ? <X className="w-6 h-6" /> : <Bot className="w-7 h-7 group-hover:rotate-12 transition-transform" />}
        </button>
      </div>
    </div>
  );
}
