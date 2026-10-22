import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './ui/App'
import { useStore } from './ui/Store'
import './index.css'


// A INTERFACE SÓ DESENHA COM OS TEXTOS DA LÍNGUA ESCOLHIDA; SE O DICIONÁRIO NÃO CARREGAR, FICA O PORTUGUÊS
void useStore.getState().setLanguage(useStore.getState().language).catch(() => null).finally(() => createRoot(document.getElementById('root') as HTMLElement).render(<StrictMode><App /></StrictMode>))
