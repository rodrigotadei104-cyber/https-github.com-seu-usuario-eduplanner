import React, { useState } from 'react';
import { X } from 'lucide-react';
import { useSchedule } from '../context/ScheduleContext';
import { format } from 'date-fns';

export const DataInspector: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
    const { aulas } = useSchedule();
    const [filter, setFilter] = useState('');

    if (!isOpen) return null;

    const filtered = aulas.filter(a =>
        a.materia.toLowerCase().includes(filter.toLowerCase()) ||
        a.curso.toLowerCase().includes(filter.toLowerCase()) ||
        String(a.data).toLowerCase().includes(filter.toLowerCase())
    );

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl h-[80vh] flex flex-col font-mono text-xs">
                <div className="flex justify-between items-center p-4 border-b">
                    <h2 className="text-lg font-bold">Data Inspector ({aulas.length} total)</h2>
                    <button onClick={onClose}><X size={20} /></button>
                </div>

                <div className="p-4 bg-gray-50 border-b">
                    <input
                        className="w-full p-2 border rounded"
                        placeholder="Filtrar por nome, curso ou data (ex: 2026-01-25)"
                        value={filter}
                        onChange={e => setFilter(e.target.value)}
                    />
                </div>

                <div className="flex-1 overflow-auto p-4 space-y-2">
                    {filtered.slice(0, 50).map((aula, i) => (
                        <div key={aula.id} className="border p-2 rounded bg-white shadow-sm">
                            <div className="font-bold text-blue-600">
                                [{i + 1}] ID: {aula.id} | Date: "{String(aula.data)}"
                            </div>
                            <div className="grid grid-cols-2 gap-2 mt-1">
                                <div><span className="text-gray-500">Curso:</span> {aula.curso}</div>
                                <div><span className="text-gray-500">Matéria:</span> {aula.materia}</div>
                                <div><span className="text-gray-500">Horário:</span> {aula.horarioInicio} - {aula.horarioFim}</div>
                                <div><span className="text-gray-500">Status:</span> {aula.status}</div>
                                <div><span className="text-gray-500">Instrutor:</span> {aula.instrutor}</div>
                                <div><span className="text-gray-500">Sala:</span> {aula.sala}</div>
                            </div>
                        </div>
                    ))}
                    {filtered.length === 0 && <div className="text-center text-gray-500 p-8">Nenhum registro encontrado.</div>}
                </div>
            </div>
        </div>
    );
};
