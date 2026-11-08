import React,{useState} from 'react';
import{createRoot}from'react-dom/client';
import{PlanejamentoInstrutorModal}from'../../../components/PlanejamentoInstrutorModal';
import'../../../index.css';
function Preview(){const[open,setOpen]=useState(true);return <main className="min-h-screen bg-slate-100 p-8 text-slate-800"><h1 className="text-xl font-bold">Prévia com dados fictícios</h1><p className="my-3">Simulação local sem acesso ao EduPlanner de produção.</p><button className="rounded-lg bg-teal-700 p-3 text-white" onClick={()=>setOpen(true)}>Abrir simulador</button><PlanejamentoInstrutorModal isOpen={open} onClose={()=>setOpen(false)}/></main>;}
createRoot(document.getElementById('root')!).render(<Preview/>);
