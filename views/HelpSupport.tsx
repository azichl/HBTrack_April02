
import React, { useState } from 'react';
import { 
  Search, Book, PlayCircle, MessageSquare, Mail, 
  FileText, ExternalLink, ChevronDown, ChevronUp, 
  LifeBuoy, Ticket, Phone
} from 'lucide-react';

const FAQS = [
  {
    question: "How do I add a new transmitter?",
    answer: "Go to the Database module, select 'Transmitters', and click the 'Add Transmitter' button. Fill in the required Platform ID, manufacturer details, and configuration settings."
  },
  {
    question: "Why is my bird's location not updating?",
    answer: "Check the transmitter's battery voltage in the Monitoring view. If the battery is healthy (>3.6V), ensure the duty cycle is currently in an 'ON' period. Cloud cover or physical obstructions can also delay satellite uplinks."
  },
  {
    question: "How can I export migration data?",
    answer: "Navigate to the 'Reports' section. Select the 'Migration Tracking' template, configure your date range and specific birds, then click 'Export CSV' or 'Export PDF'."
  },
  {
    question: "What does the 'Geofence Alert' mean?",
    answer: "This alert triggers when a bird crosses a virtual boundary (like a national border) or moves a significant distance (>50km) between two consecutive fixes, indicating potential migration start."
  },
  {
    question: "How do I reset my password?",
    answer: "Go to Settings > Security. You will need your current password to set a new one. If you have lost access entirely, please contact your system administrator."
  }
];

export const HelpSupport = () => {
  const [activeTab, setActiveTab] = useState('faq');
  const [searchQuery, setSearchQuery] = useState('');
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);

  const toggleFaq = (index: number) => {
    setOpenFaqIndex(openFaqIndex === index ? null : index);
  };

  const filteredFaqs = FAQS.filter(f => 
    f.question.toLowerCase().includes(searchQuery.toLowerCase()) || 
    f.answer.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in pb-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white">Help & Support</h2>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Get help with HoubaraTracker and submit support requests</p>
        </div>
        <div className="flex gap-3">
          <button className="px-4 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-700 dark:text-gray-200 flex items-center gap-2 shadow-sm transition-colors">
            <Book size={16} /> User Guide
          </button>
          <button className="px-4 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-700 dark:text-gray-200 flex items-center gap-2 shadow-sm transition-colors">
            <PlayCircle size={16} /> Video Tutorials
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex bg-gray-100 dark:bg-slate-800 p-1 rounded-xl w-full md:w-fit overflow-x-auto">
        <button 
          onClick={() => setActiveTab('faq')}
          className={`flex-1 md:flex-none px-6 py-2 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 ${activeTab === 'faq' ? 'bg-white dark:bg-slate-600 text-brand-700 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'}`}
        >
          <LifeBuoy size={16} /> FAQ
        </button>
        <button 
          onClick={() => setActiveTab('contact')}
          className={`flex-1 md:flex-none px-6 py-2 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 ${activeTab === 'contact' ? 'bg-white dark:bg-slate-600 text-brand-700 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'}`}
        >
          <MessageSquare size={16} /> Contact Us
        </button>
        <button 
          onClick={() => setActiveTab('tickets')}
          className={`flex-1 md:flex-none px-6 py-2 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 ${activeTab === 'tickets' ? 'bg-white dark:bg-slate-600 text-brand-700 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'}`}
        >
          <Ticket size={16} /> My Tickets
        </button>
        <button 
          onClick={() => setActiveTab('resources')}
          className={`flex-1 md:flex-none px-6 py-2 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 ${activeTab === 'resources' ? 'bg-white dark:bg-slate-600 text-brand-700 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'}`}
        >
          <FileText size={16} /> Resources
        </button>
      </div>

      {/* Content */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm overflow-hidden min-h-[400px]">
        
        {/* FAQ TAB */}
        {activeTab === 'faq' && (
          <div className="p-6 md:p-8">
            <div className="mb-8">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <LifeBuoy className="text-brand-500" size={20} /> Frequently Asked Questions
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Find answers to common questions about HoubaraTracker</p>
            </div>

            <div className="relative mb-6">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input 
                type="text" 
                placeholder="Search FAQ..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-11 pr-4 py-3 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-brand-500 transition-all"
              />
            </div>

            <div className="space-y-3">
              {filteredFaqs.map((faq, index) => (
                <div key={index} className="border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden">
                  <button 
                    onClick={() => toggleFaq(index)}
                    className="w-full flex items-center justify-between p-4 bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors text-left"
                  >
                    <span className="font-semibold text-gray-800 dark:text-gray-200 text-sm pr-4">{faq.question}</span>
                    {openFaqIndex === index ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                  </button>
                  {openFaqIndex === index && (
                    <div className="p-4 bg-gray-50 dark:bg-slate-900/50 border-t border-gray-200 dark:border-slate-700 text-sm text-gray-600 dark:text-gray-300 leading-relaxed animate-in slide-in-from-top-2 duration-200">
                      {faq.answer}
                    </div>
                  )}
                </div>
              ))}
              {filteredFaqs.length === 0 && (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  No results found for "{searchQuery}"
                </div>
              )}
            </div>
          </div>
        )}

        {/* CONTACT TAB */}
        {activeTab === 'contact' && (
          <div className="p-6 md:p-8">
             <div className="grid md:grid-cols-2 gap-12">
                <div className="space-y-6">
                   <div>
                      <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Get in Touch</h3>
                      <p className="text-gray-500 dark:text-gray-400 text-sm">We are here to help. Send us a message and we will respond as soon as possible.</p>
                   </div>
                   
                   <div className="space-y-4">
                      <div className="flex items-start gap-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-800">
                         <div className="p-2 bg-blue-100 dark:bg-blue-800 text-blue-600 dark:text-blue-200 rounded-lg">
                            <Mail size={20} />
                         </div>
                         <div>
                            <h4 className="font-bold text-gray-900 dark:text-white text-sm">Email Support</h4>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">support@houbaratracker.com</p>
                            <p className="text-xs text-gray-400 mt-1">Response time: &lt; 24 hours</p>
                         </div>
                      </div>

                      <div className="flex items-start gap-4 p-4 bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-100 dark:border-green-800">
                         <div className="p-2 bg-green-100 dark:bg-green-800 text-green-600 dark:text-green-200 rounded-lg">
                            <Phone size={20} />
                         </div>
                         <div>
                            <h4 className="font-bold text-gray-900 dark:text-white text-sm">Technical Hotline</h4>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">+971 50 123 4567</p>
                            <p className="text-xs text-gray-400 mt-1">Mon-Fri, 9am - 6pm GST</p>
                         </div>
                      </div>
                   </div>
                </div>

                <div className="bg-gray-50 dark:bg-slate-900 p-6 rounded-xl border border-gray-200 dark:border-slate-700">
                   <h4 className="font-bold text-gray-900 dark:text-white text-sm mb-4">Send us a message</h4>
                   <form className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                         <div>
                            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Name</label>
                            <input type="text" className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-sm outline-none focus:ring-2 focus:ring-brand-500" />
                         </div>
                         <div>
                            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Email</label>
                            <input type="email" className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-sm outline-none focus:ring-2 focus:ring-brand-500" />
                         </div>
                      </div>
                      <div>
                          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Subject</label>
                          <input type="text" className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-sm outline-none focus:ring-2 focus:ring-brand-500" />
                      </div>
                      <div>
                          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Message</label>
                          <textarea className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-sm outline-none focus:ring-2 focus:ring-brand-500 h-32 resize-none" />
                      </div>
                      <button className="w-full py-2.5 bg-brand-600 text-white rounded-lg text-sm font-bold hover:bg-brand-700 transition-colors shadow-md">
                         Send Message
                      </button>
                   </form>
                </div>
             </div>
          </div>
        )}

        {/* Placeholder Tabs */}
        {(activeTab === 'tickets' || activeTab === 'resources') && (
           <div className="flex flex-col items-center justify-center p-12 text-center h-[400px]">
              <div className="p-4 bg-gray-100 dark:bg-slate-700 rounded-full mb-4">
                 {activeTab === 'tickets' ? <Ticket size={32} className="text-gray-400" /> : <FileText size={32} className="text-gray-400" />}
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
                 {activeTab === 'tickets' ? 'No Active Tickets' : 'Resource Library'}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs">
                 {activeTab === 'tickets' 
                    ? 'You haven\'t submitted any support tickets yet. Use the Contact form to get started.' 
                    : 'Download manuals, API documentation, and field guides here.'}
              </p>
           </div>
        )}

      </div>
    </div>
  );
};
