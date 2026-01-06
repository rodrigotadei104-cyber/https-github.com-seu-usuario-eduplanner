import React, { useState, useEffect } from 'react';
import { X, Settings as SettingsIcon, Moon, Sun, Clock, Shield } from 'lucide-react';
import { useSchedule } from '../context/ScheduleContext';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
    const { userProfile, updateUserProfile, appSettings, updateAppSettings } = useSchedule();

    const [activeTab, setActiveTab] = useState<'profile' | 'preferences'>('profile');

    // Local state for form
    const [name, setName] = useState(userProfile.name);
    const [email, setEmail] = useState(userProfile.email);
    const [defaultDuration, setDefaultDuration] = useState(appSettings.defaultClassDuration);
    const [theme, setTheme] = useState(appSettings.theme);

    const isAdmin = userProfile.role === 'admin';

    // Sync state when modal opens
    useEffect(() => {
        if (isOpen) {
            setName(userProfile.name);
            setEmail(userProfile.email);
            setDefaultDuration(appSettings.defaultClassDuration);
            setTheme(appSettings.theme);
        }
    }, [isOpen, userProfile, appSettings]);

    if (!isOpen) return null;

    const handleSave = () => {
        // Generate initials fallback
        const initials = name
            .split(' ')
            .map((n) => n[0])
            .slice(0, 2)
            .join('')
            .toUpperCase();

        updateUserProfile({
            ...userProfile,
            name,
            email,
            avatarInitials: initials,
        });

        // Only save settings if admin
        if (isAdmin) {
            updateAppSettings({ theme, defaultClassDuration: Number(defaultDuration) });
        }
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200 dark:bg-slate-800 dark:border dark:border-slate-700">
                <div className="flex justify-between items-center p-6 border-b border-gray-100 dark:border-slate-700">
                    <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2 dark:text-white">
                        <SettingsIcon className="w-6 h-6 text-gray-500 dark:text-gray-400" />
                        Configurações
                    </h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors dark:hover:text-gray-200">
                        <X size={24} />
                    </button>
                </div>

                <div className="flex border-b border-gray-100 dark:border-slate-700">
                    <button
                        onClick={() => setActiveTab('profile')}
                        className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'profile'
                            ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                            : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                            }`}
                    >
                        Perfil
                    </button>
                    <button
                        onClick={() => setActiveTab('preferences')}
                        disabled={!isAdmin}
                        className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors flex items-center justify-center gap-2 ${activeTab === 'preferences'
                            ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                            : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                            } ${!isAdmin ? 'opacity-50 cursor-not-allowed' : ''}`}
                        title={!isAdmin ? 'Apenas Administradores' : ''}
                    >
                        Preferências do Sistema
                        {!isAdmin && <Shield size={12} />}
                    </button>
                </div>

                <div className="p-6">
                    {activeTab === 'profile' && (
                        <div className="space-y-4">
                            <div className="flex items-center gap-4 mb-6">
                                <div className="w-20 h-20 rounded-full bg-blue-100 flex items-center justify-center border-2 border-white shadow-md dark:bg-blue-900 dark:border-slate-700 overflow-hidden">
                                    <span className="font-bold text-2xl text-blue-600 dark:text-blue-300">
                                        {name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase() || 'JD'}
                                    </span>
                                </div>

                                <div className="flex-1">
                                    <p className="text-sm font-medium text-gray-900 dark:text-white mb-1">Seu Perfil</p>
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-slate-700 dark:text-gray-300 uppercase">
                                        <Shield size={12} />
                                        {userProfile.role === 'admin' ? 'Administrador' : userProfile.role === 'editor' ? 'Editor' : 'Visualizador'}
                                    </span>
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">Nome Completo</label>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">E-mail</label>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                                />
                            </div>
                        </div>
                    )}

                    {activeTab === 'preferences' && isAdmin && (
                        <div className="space-y-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-3 dark:text-gray-300">Tema</label>
                                <div className="grid grid-cols-2 gap-4">
                                    <button
                                        onClick={() => setTheme('light')}
                                        className={`flex items-center justify-center gap-2 p-3 rounded-lg border-2 transition-all ${theme === 'light'
                                            ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300'
                                            : 'border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-slate-600 dark:text-gray-400 dark:hover:bg-slate-700'
                                            }`}
                                    >
                                        <Sun size={20} />
                                        Claro
                                    </button>
                                    <button
                                        onClick={() => setTheme('dark')}
                                        className={`flex items-center justify-center gap-2 p-3 rounded-lg border-2 transition-all ${theme === 'dark'
                                            ? 'border-blue-500 bg-gray-800 text-white dark:bg-slate-700 dark:border-blue-500'
                                            : 'border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-slate-600 dark:text-gray-400 dark:hover:bg-slate-700'
                                            }`}
                                    >
                                        <Moon size={20} />
                                        Escuro
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-3 dark:text-gray-300">Duração Padrão de Aula</label>
                                <div className="grid grid-cols-3 gap-3">
                                    {[60, 90, 120].map((mins) => (
                                        <button
                                            key={mins}
                                            onClick={() => setDefaultDuration(mins)}
                                            className={`flex flex-col items-center justify-center p-3 rounded-lg border transition-all ${defaultDuration === mins
                                                ? 'border-blue-500 bg-blue-50 text-blue-700 ring-1 ring-blue-500 dark:bg-blue-900/50 dark:text-blue-300 dark:ring-blue-500'
                                                : 'border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-slate-600 dark:text-gray-400 dark:hover:bg-slate-700'
                                                }`}
                                        >
                                            <Clock size={20} className="mb-1" />
                                            <span className="font-medium">{mins} min</span>
                                        </button>
                                    ))}
                                </div>
                                <p className="text-xs text-gray-500 mt-2 dark:text-gray-400">
                                    Define o tempo automático ao criar uma nova aula.
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex justify-end gap-3 p-6 border-t border-gray-100 bg-gray-50 dark:bg-slate-900/50 dark:border-slate-700">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition dark:bg-slate-800 dark:text-gray-300 dark:border-slate-600 dark:hover:bg-slate-700"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSave}
                        className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition shadow-sm"
                    >
                        Salvar Alterações
                    </button>
                </div>
            </div>
        </div>
    );
};