import React, { useState } from 'react';
import { SALAS_DISPONIVEIS } from '../constants';

interface SalaSelectProps {
    value: string;
    onChange: (value: string) => void;
    /** Chamado numa escolha deliberada: selecionar item da lista ou sair do campo "Outro". */
    onCommit?: (value: string) => void;
    disabled?: boolean;
    className?: string;
    emptyLabel?: string;
    id?: string;
}

const OUTRO = '__OUTRO__';

// Dropdown padronizado de sala. Usa a lista fixa (SALAS_DISPONIVEIS) e mais a opção
// "Outro", que revela um campo de texto livre. Valores fora da lista (dados antigos como
// "Sala 01") entram automaticamente no modo "Outro" — assim editar não apaga o valor, e o
// usuário pode trocar por uma sala padronizada.
export const SalaSelect: React.FC<SalaSelectProps> = ({
    value, onChange, onCommit, disabled, className = '', emptyLabel = '— Selecione a sala —', id,
}) => {
    const [outro, setOutro] = useState<boolean>(() => !!value && !SALAS_DISPONIVEIS.includes(value));

    const selectValue = outro ? OUTRO : (SALAS_DISPONIVEIS.includes(value) ? value : '');

    const handleSelect = (v: string) => {
        if (v === OUTRO) {
            setOutro(true);
            onChange(''); // limpa para digitar o nome livre
        } else {
            setOutro(false);
            onChange(v);
            onCommit?.(v);
        }
    };

    return (
        <div className="flex flex-col gap-1">
            <select
                id={id}
                disabled={disabled}
                value={selectValue}
                onChange={e => handleSelect(e.target.value)}
                className={className}
            >
                <option value="">{emptyLabel}</option>
                {SALAS_DISPONIVEIS.map(s => <option key={s} value={s}>{s}</option>)}
                <option value={OUTRO}>Outro (especificar)</option>
            </select>
            {outro && (
                <input
                    type="text"
                    autoFocus
                    disabled={disabled}
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    onBlur={e => onCommit?.(e.target.value.trim())}
                    placeholder="Digite o nome da sala"
                    className={className}
                />
            )}
        </div>
    );
};

export default SalaSelect;
