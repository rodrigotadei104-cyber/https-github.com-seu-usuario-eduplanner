interface AulaComTurma {
    tenant_id?: string;
    turma_id?: string | null;
    numero_turma?: string | null;
}

// Recupera apenas números ausentes pelo vínculo explícito, nunca pelo nome do curso.
// Se os registros da turma divergem, mantém o dado ausente para não inventar uma identidade.
export function resolveAulaTurmas<T extends AulaComTurma>(aulas: T[]): T[] {
    const numeros = new Map<string, Set<string>>();
    const chave = (a: T) => JSON.stringify([a.tenant_id, a.turma_id]);
    for (const aula of aulas) {
        const numero = aula.numero_turma?.trim();
        if (!aula.turma_id || !numero) continue;
        const key = chave(aula);
        if (!numeros.has(key)) numeros.set(key, new Set());
        numeros.get(key)!.add(numero);
    }
    return aulas.map(aula => {
        if (aula.numero_turma?.trim() || !aula.turma_id) return aula;
        const candidatos = numeros.get(chave(aula));
        if (candidatos?.size !== 1) return aula;
        return { ...aula, numero_turma: [...candidatos][0] };
    });
}
