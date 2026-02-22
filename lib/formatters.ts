/**
 * Utilitários de formatação para exibição de valores numéricos no Dashboard.
 * Todos os formatadores atuam SOMENTE na camada de apresentação.
 * Nenhum dado persistido é modificado.
 */

/**
 * Formata um número com precisão e separador de milhar.
 * @param value - Valor numérico a formatar
 * @param decimals - Casas decimais desejadas (padrão: 1 para horas)
 */
export function formatNumber(value: number, decimals = 1): string {
    if (!isFinite(value) || isNaN(value)) return '0';
    return new Intl.NumberFormat('pt-BR', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    }).format(value);
}

/**
 * Formata horas como número limpo (ex: 496,6) ou sem decimais se for inteiro.
 * Remove artefatos de ponto flutuante.
 */
export function formatHoras(value: number): string {
    if (!isFinite(value) || isNaN(value)) return '0';
    // Se for inteiro, exibe sem casas decimais
    const rounded = Math.round(value * 10) / 10;
    if (Number.isInteger(rounded)) {
        return String(rounded);
    }
    return new Intl.NumberFormat('pt-BR', {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
    }).format(rounded);
}

/**
 * Formata horas no formato "Xh Ymin" para melhor legibilidade.
 * Ex: 496.64 → "496h 38min"
 */
export function formatHorasDetalhado(value: number): string {
    if (!isFinite(value) || isNaN(value)) return '0h';
    const totalMin = Math.round(value * 60);
    const h = Math.floor(totalMin / 60);
    const min = totalMin % 60;
    if (min === 0) return `${h}h`;
    return `${h}h ${min}min`;
}

/**
 * Arredonda e formata percentual (sem casas decimais extras).
 */
export function formatPercent(value: number): string {
    if (!isFinite(value) || isNaN(value)) return '0%';
    return `${Math.round(value)}%`;
}
