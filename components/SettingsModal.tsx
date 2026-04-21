import React, { useState, useEffect } from 'react';
import { useSchedule } from '../context/ScheduleContext';
import { userService } from '../services/user.service';
import { Avatar } from './Avatar';

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

    // Upload State
    const [isUploading, setIsUploading] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);

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

    const handleSave = async () => {
        try {
            // Persist Name change to Backend
            if (userProfile.id && name !== userProfile.name) {
                const result = await userService.updateProfile(userProfile.id, { name });
                if (!result.success) {
                    throw new Error(result.error);
                }
            }

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
                email, // Email update not supported in this simplified flow yet
                avatarInitials: initials,
            });

            // Only save settings if admin
            if (isAdmin) {
                updateAppSettings({ theme, defaultClassDuration: Number(defaultDuration) });
            }
            onClose();
        } catch (error: any) {
            console.error('Error saving profile:', error);
            alert('Erro ao salvar perfil: ' + error.message);
        }
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !userProfile.id) return;

        const objectUrl = URL.createObjectURL(file);
        const previousAvatar = userProfile.avatarUrl;

        updateUserProfile({
            ...userProfile,
            avatarUrl: objectUrl
        });

        setIsUploading(true);
        setUploadError(null);

        try {
            const result = await userService.uploadAvatar(userProfile.id, file);

            if (result.success && result.data) {
                updateUserProfile({
                    ...userProfile,
                    avatarUrl: result.data as string
                });
            } else {
                throw new Error(result.error || 'Erro no upload');
            }
        } catch (err: any) {
            console.error(err);
            setUploadError(err.message || 'Erro inesperado');
            updateUserProfile({
                ...userProfile,
                avatarUrl: previousAvatar
            });
        } finally {
            setIsUploading(false);
            URL.revokeObjectURL(objectUrl);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200 dark:bg-slate-800 dark:border dark:border-slate-700">
                <div className="flex justify-between items-center p-6 border-b border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-700">
                    <h2 className="text-xl font-black text-gray-800 flex items-center gap-2 dark:text-white uppercase tracking-tighter">
                        <div className="px-2 py-0.5 bg-gray-600 text-white text-[10px] rounded uppercase tracking-widest font-black">Config</div>
                        Configurações
                    </h2>
                    <button onClick={onClose} className="text-[10px] font-black text-gray-400 hover:text-black uppercase tracking-widest transition-colors dark:hover:text-gray-200">
                        Fechar [X]
                    </button>
                </div>

                <div className="flex border-b border-gray-100 dark:border-slate-700">
                    <button
                        onClick={() => setActiveTab('profile')}
                        className={`flex-1 py-4 text-[10px] font-black uppercase tracking-[0.2em] transition-colors border-b-2 ${activeTab === 'profile'
                            ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                            : 'border-transparent text-gray-400 hover:text-gray-700'
                            }`}
                    >
                        PERFIL
                    </button>
                    <button
                        onClick={() => setActiveTab('preferences')}
                        disabled={!isAdmin}
                        className={`flex-1 py-4 text-[10px] font-black uppercase tracking-[0.2em] transition-colors border-b-2 ${activeTab === 'preferences'
                            ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                            : 'border-transparent text-gray-400 hover:text-gray-700'
                            } ${!isAdmin ? 'opacity-30 cursor-not-allowed' : ''}`}
                    >
                        {isAdmin ? 'SISTEMA' : 'SISTEMA [ RESTRITO ]'}
                    </button>
                </div>

                <div className="p-6">
                    {activeTab === 'profile' && (
                        <div className="space-y-6">
                            <div className="flex items-center gap-6 pb-6 border-b border-gray-50 dark:border-slate-700">
                                <div className="relative">
                                    <Avatar
                                        name={name}
                                        url={userProfile.avatarUrl}
                                        size="xl"
                                        className="border-4 border-gray-100 shadow-sm dark:border-slate-700"
                                    />
                                    <label className="absolute -bottom-2 -right-2 bg-indigo-600 text-white px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest cursor-pointer shadow-lg hover:bg-indigo-700 transition">
                                        {isUploading ? '...' : '[ FOTO ]'}
                                        <input type="file" className="hidden" accept="image/*" onChange={handleFileChange} disabled={isUploading} />
                                    </label>
                                </div>
                                <div>
                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Nível de Acesso</p>
                                    <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-[10px] font-black uppercase tracking-widest rounded dark:bg-indigo-900/40 dark:text-indigo-400">
                                        {userProfile.role === 'admin' ? '[ ADM ]' : userProfile.role === 'editor' ? '[ EDIT ]' : '[ VIEW ]'}
                                    </span>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Nome Completo</label>
                                    <input
                                        type="text"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:border-indigo-600 outline-none transition font-black uppercase text-[12px] tracking-tight dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">E-mail Corporativo</label>
                                    <input
                                        type="email"
                                        value={email}
                                        disabled
                                        className="w-full px-4 py-3 bg-gray-100 border border-gray-200 rounded-lg text-gray-500 font-medium text-[12px] dark:bg-slate-800 dark:border-slate-700 cursor-not-allowed opacity-60"
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'preferences' && isAdmin && (
                        <div className="space-y-8">
                            <div>
                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Modo de Interface</label>
                                <div className="grid grid-cols-2 gap-4">
                                    <button
                                        onClick={() => setTheme('light')}
                                        className={`py-6 border-2 font-black text-[11px] uppercase tracking-[0.2em] rounded-xl transition-all ${theme === 'light'
                                            ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                                            : 'border-gray-100 text-gray-400 hover:border-gray-300'
                                            }`}
                                    >
                                        [ CLARO ]
                                    </button>
                                    <button
                                        onClick={() => setTheme('dark')}
                                        className={`py-6 border-2 font-black text-[11px] uppercase tracking-[0.2em] rounded-xl transition-all ${theme === 'dark'
                                            ? 'border-indigo-600 bg-slate-800 text-white'
                                            : 'border-gray-100 text-gray-400 hover:border-gray-300'
                                            }`}
                                    >
                                        [ ESCURO ]
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Duração Padrão (Minutos)</label>
                                <div className="grid grid-cols-3 gap-3">
                                    {[60, 90, 120].map((mins) => (
                                        <button
                                            key={mins}
                                            onClick={() => setDefaultDuration(mins)}
                                            className={`py-3 border-2 font-black text-[11px] rounded uppercase transition-all ${defaultDuration === mins
                                                ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                                                : 'border-gray-100 text-gray-400 hover:border-gray-300'
                                                }`}
                                        >
                                            {mins} MIN
                                        </button>
                                    ))}
                                </div>
                                <p className="text-[9px] font-black text-gray-400 mt-2 uppercase tracking-widest opacity-60">PROPRIEDADE GLOBAL: AFETA NOVOS AGENDAMENTOS.</p>
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex justify-between items-center gap-3 p-6 border-t border-gray-100 bg-gray-50 dark:bg-slate-900/50 dark:border-slate-700">
                    <div className="text-[8px] font-black text-gray-400 uppercase tracking-widest">v1.2.0-STABLE</div>
                    <div className="flex gap-3">
                        <button
                            onClick={onClose}
                            className="px-6 py-2 text-[10px] font-black uppercase tracking-widest text-gray-500 hover:text-black transition"
                        >
                            [ CANCELAR ]
                        </button>
                        <button
                            onClick={handleSave}
                            className="px-8 py-2 text-[10px] font-black uppercase tracking-widest text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 shadow-md transition"
                        >
                            SALVAR ALTERAÇÕES
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};