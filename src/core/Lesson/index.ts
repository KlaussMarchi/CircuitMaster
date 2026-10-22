import { formatReading, formatSi } from '../Properties'
import type { Part } from '../Part'
import { t } from '../Text'

export type Values = { V: number | null, I: number | null, get: (key: string, symbol: string) => number | null }

export type Lesson = { what: string, how: string, formula: string, live: (values: Values) => (string | false)[] }

const v = (value: number) => formatReading(value, 'V')
const a = (value: number) => formatReading(value, 'A')
const w = (value: number) => formatReading(value, 'W')

const power = ({ V, I }: Values) => [V !== null && I !== null && I !== 0 && `P = V · I = ${v(V)} × ${a(I)} = ${w(Math.abs(V * I))}`]

const forward = ({ V, I }: Values) => [V !== null && t('V_f = {0} no circuito', v(V)), V !== null && I !== null && `I = ${a(I)}    P = ${w(Math.abs(V * I))}`]

const ohm = (values: Values) => {
    const R = values.get('resistance', 'Ω')
    return [values.V !== null && R !== null && R > 0 && `I = V / R = ${v(values.V)} / ${formatSi(R, 'Ω')} = ${a(values.V / R)}`, ...power(values)]
}

const charge = ({ V, get }: Values) => {
    const C = get('capacitance', 'F')
    return V === null || C === null ? [] : [`Q = C · V = ${formatSi(C, 'F')} × ${v(V)} = ${formatReading(C * V, 'C')}`, `E = ½ · C · V² = ${formatReading(C * V * V / 2, 'J')}`]
}

const flux = ({ I, get }: Values) => {
    const L = get('inductance', 'H')
    return [I !== null && L !== null && `E = ½ · L · I² = ½ × ${formatSi(L, 'H')} × (${a(I)})² = ${formatReading(L * I * I / 2, 'J')}`]
}

const divider = ({ get }: Values) => {
    const R = get('maximum resistance', 'Ω')
    return [R !== null && `R_total = ${formatSi(R, 'Ω')}`]
}

// O QUE É, COMO FUNCIONA E A FÓRMULA DE CADA FAMÍLIA, NA ORDEM DE BUSCA (O MAIS ESPECÍFICO ANTES: "LED DRIVER" É CI, NÃO LED)
const LESSONS: [RegExp, Lesson][] = [
    [/regulator/, { what: 'Regulador de tensão: mantém a saída fixa (5 V, 3,3 V…) mesmo que a entrada ou a carga mudem.', how: 'Um transistor interno absorve a diferença entre a entrada e a saída; essa queda vira calor no corpo do regulador.', formula: 'P = (V_entrada − V_saída) · I', live: () => [] }],
    [/display|segment|lcd|oled|matrix/, { what: 'Mostrador de números, texto ou imagens.', how: 'Cada segmento ou pixel é um LED ou um cristal líquido acionado pelo microcontrolador, direto ou por um driver.', formula: 'corrente por segmento: I = (V − V_f) / R', live: () => [] }],
    [/microcontroller|mikrocontroller|arduino|cpu board|raspberry|\bpic\b|picaxe|basic stamp|wemos|esp|feather|qt py|trinkey|chipkit|\bavr\b|\barm\b|spresense|calliope|fpga/, { what: 'Microcontrolador: um computador num chip que lê entradas, roda o programa e aciona saídas.', how: 'Os pinos digitais valem 0 ou V_cc; as entradas analógicas convertem tensão em número (ADC); o programa decide o que cada pino faz.', formula: 'leitura do ADC = V · (2ⁿ − 1) / V_ref', live: () => [] }],
    [/op-?amp|operational|amplifier|comparator/, { what: 'Amplificador operacional: ganho altíssimo entre as entradas + e −.', how: 'Com realimentação negativa ele ajusta a saída até V+ = V−; daí saem os ganhos dos amplificadores.', formula: 'não inversor: G = 1 + R_f / R_g    inversor: G = −R_f / R_in', live: () => [] }],
    [/555/, { what: 'Timer 555: gera pulsos, atrasos e ondas quadradas com um resistor e um capacitor.', how: 'Dois comparadores internos carregam e descarregam o capacitor externo entre 1/3 e 2/3 de V_cc; ligado como astável oscila sozinho, como monoestável dá um pulso de largura fixa a cada disparo.', formula: 'astável: f = 1,44 / ((R₁ + 2·R₂) · C)    monoestável: t = 1,1 · R · C', live: () => [] }],
    [/\bic\b|driver|eeprom|memory|mux|logic|timer|555|shift register|counter|decoder|\b74|\b40\d\d|\bgate\b|converter|reference|\badc\b|\bdac\b|rtc|real time clock|pcf8574/, { what: 'Circuito integrado: muitos transistores num chip, com uma função pronta.', how: 'A folha de dados diz o que cada pino faz; ligue V_cc e GND antes de tudo e um capacitor de 100 nF perto da alimentação.', formula: '', live: () => [] }],
    [/mosfet|\bfet\b/, { what: 'MOSFET: transistor em que a tensão no gate controla a corrente entre dreno e fonte.', how: 'Acima da tensão de limiar (V_th) o canal conduz; o gate quase não consome corrente, por isso o microcontrolador o aciona direto.', formula: 'I_D ≈ k · (V_GS − V_th)²', live: () => [] }],
    [/transistor|bipolar|darlington/, { what: 'Transistor bipolar: uma corrente pequena na base controla uma corrente maior entre coletor e emissor.', how: 'Com V_BE ≈ 0,7 V a base conduz e o coletor deixa passar β vezes a corrente da base, até saturar como uma chave fechada.', formula: 'I_C = β · I_B    V_BE ≈ 0,7 V', live: () => [] }],
    [/opto/, { what: 'Optoacoplador: um LED e um fototransistor no mesmo encapsulamento, sem ligação elétrica entre eles.', how: 'A luz do LED liga o transistor do outro lado; isola dois circuitos, como o microcontrolador e a rede elétrica.', formula: 'CTR = I_C / I_F', live: () => [] }],
    [/neopixel|ws281/, { what: 'LED endereçável: LED RGB com um controlador próprio, ligado em cadeia.', how: 'Um único pino de dados do microcontrolador manda a cor de cada LED da fila; cada um consome até 60 mA no branco.', formula: 'I_total ≈ 60 mA × número de LEDs', live: () => [] }],
    [/\bled\b/, { what: 'LED: diodo que emite luz quando a corrente vai do ânodo (+, perna longa) ao cátodo (−).', how: 'Só acende acima da tensão direta (cerca de 2 V no vermelho, 3 V no azul e no branco); precisa de um resistor em série para limitar a corrente.', formula: 'R = (V_fonte − V_f) / I    P = V_f · I', live: forward }],
    [/diode|rectifier|zener|schottky/, { what: 'Diodo: deixa a corrente passar num sentido só, do ânodo para o cátodo (a faixa).', how: 'No sentido direto conduz depois de uns 0,7 V (silício); no inverso fica aberto. O zener conduz ao contrário a partir da tensão dele.', formula: 'I = I_s · (e^(V / n·V_T) − 1)', live: forward }],
    [/potentiometer|trimpot|rheostat/, { what: 'Potenciômetro: resistor com um cursor que divide a resistência total em duas partes.', how: 'Entre as pontas a resistência é fixa; o cursor tira uma fração da tensão aplicada: é um divisor de tensão.', formula: 'V_cursor = V · R₂ / (R₁ + R₂)', live: divider }],
    [/resistor/, { what: 'Resistor: limita a corrente e divide a tensão.', how: 'A tensão sobre ele é proporcional à corrente (lei de Ohm); a energia que passa vira calor, que precisa caber na potência nominal.', formula: 'V = R · I    P = V · I = R · I²', live: ohm }],
    [/capacitor|\bcap\b/, { what: 'Capacitor: guarda carga elétrica entre duas placas separadas por um isolante.', how: 'A tensão nele não salta: carrega e descarrega pelo resistor em série com a constante de tempo τ = R·C. Em regime DC não passa corrente.', formula: 'Q = C · V    i = C · dV/dt    E = ½ · C · V²', live: charge }],
    [/inductor|coil|choke/, { what: 'Indutor: bobina que guarda energia no campo magnético.', how: 'A corrente nele não salta: muda aos poucos, com a constante de tempo τ = L/R. Em regime DC é um fio.', formula: 'v = L · di/dt    E = ½ · L · I²', live: flux }],
    [/battery|voltage source|power supply|power plug|solar/, { what: 'Fonte de tensão: mantém a diferença de potencial entre + e −.', how: 'Empurra corrente por tudo o que estiver ligado a ela; quem decide quanta corrente passa é a carga.', formula: 'P = V · I', live: power }],
    [/relay/, { what: 'Relé: chave acionada por um eletroímã.', how: 'Corrente na bobina puxa o contato; um diodo em antiparalelo com a bobina absorve o pico de tensão ao desligar.', formula: 'I_bobina = V / R_bobina', live: power }],
    [/motor|servo|stepper/, { what: 'Motor: converte energia elétrica em giro.', how: 'A velocidade cresce com a tensão e a corrente cresce com a carga no eixo; acione por transistor, não pelo pino do microcontrolador.', formula: 'P = V · I', live: power }],
    [/buzzer|speaker|piezo/, { what: 'Buzzer ou alto-falante: transforma sinal elétrico em som.', how: 'Vibra na frequência do sinal; o buzzer ativo já tem oscilador e só precisa de tensão.', formula: 'f = 1 / T', live: power }],
    [/switch|button|reed|tilt/, { what: 'Chave: abre ou fecha o caminho da corrente.', how: 'Fechada é um fio; aberta, um corte. Durante a simulação, clique nela para mudar de posição.', formula: 'fechada: V ≈ 0    aberta: I = 0', live: ({ V, I }) => [V !== null && I !== null && `V = ${v(V)}    I = ${a(I)}`] }],
    [/crystal|oscillator|resonator/, { what: 'Cristal: fixa uma frequência precisa para o relógio do circuito.', how: 'O quartzo vibra numa frequência mecânica própria e o circuito oscilador o mantém vibrando.', formula: 'f = 1 / T', live: () => [] }],
    [/sensor|photo|ldr|thermistor|light|accelero|gyro|\bimu\b|compass|magnet|encoder|microphone|temperature|pressure|humidity/, { what: 'Sensor: converte uma grandeza física (luz, temperatura, distância…) em sinal elétrico.', how: 'A resistência ou a tensão de saída muda com o que ele mede, e o microcontrolador lê essa tensão.', formula: 'divisor: V_saída = V · R_sensor / (R_sensor + R)', live: () => [] }],
    [/multimeter/, { what: 'Multímetro: mede tensão, corrente ou resistência no circuito simulado.', how: 'Em tensão, ligue as pontas em paralelo com o que mede; em corrente, em série no caminho da corrente.', formula: 'V = R · I', live: () => [] }],
    [/oscilloscope/, { what: 'Osciloscópio: mostra a tensão ao longo do tempo.', how: 'Ligue a ponta no nó e o terra no GND; o painel de simulação mostra as mesmas curvas.', formula: 'f = 1 / T', live: () => [] }],
    [/wireless|bluetooth|xbee|wi-?fi|gps|antenna|transceiver|\brf\b|radio|lora|nrf/, { what: 'Módulo de rádio: envia e recebe dados sem fio (Bluetooth, Wi-Fi, GPS, RF).', how: 'Conversa com o microcontrolador por serial, SPI ou I²C; confira a tensão de alimentação, muitos aceitam só 3,3 V.', formula: 'λ = c / f', live: () => [] }],
    [/jumper/, { what: 'Jumper: ponte que liga dois pontos do circuito.', how: 'Fechado, as duas nets viram uma; o de solda se fecha com uma gota de estanho entre as ilhas.', formula: '', live: () => [] }],
    [/fuse|ptc/, { what: 'Fusível: abre o circuito quando a corrente passa do limite.', how: 'O filamento derrete (ou o polímero do PTC aquece) e corta a corrente, protegendo o resto.', formula: 'I > I_nominal ⇒ abre', live: () => [] }],
    [/net label|power label|ground/, { what: 'Rótulo de net: liga pontos do esquemático pelo nome, sem fio desenhado.', how: 'Todos os rótulos com o mesmo nome (ou todos os GND) são a mesma net.', formula: '', live: () => [] }],
    [/logo|silkscreen image/, { what: 'Logotipo: texto ou imagem gravados na serigrafia ou no cobre da placa.', how: 'Não liga nada eletricamente; serve para identificar a placa.', formula: '', live: () => [] }],
    [/\bpcb\b|prototyping board|stand ?off|shield/, { what: 'Placa: o suporte das peças e das trilhas de cobre.', how: 'Na vista PCB o contorno dela define onde vão peças e trilhas; o DRC confere as distâncias e o Gerber sai dela.', formula: '', live: () => [] }],
    [/breadboard/, { what: 'Protoboard: placa de ensaio com furos ligados por tiras de metal.', how: 'Cada coluna de 5 furos é uma net; as linhas laterais (+ e −) levam a alimentação.', formula: '', live: () => [] }],
    [/connector|header|jack|usb|terminal|socket/, { what: 'Conector: ponto de ligação com fios, cabos ou outras placas.', how: 'Cada pino é uma net; o nome do pino diz o sinal que passa por ele.', formula: '', live: () => [] }]
]

const MAX_TEXT = 280  // DESCRIÇÃO DO .fzp CORTADA NO CARTÃO

const plain = (html: string) => html.replace(/<(style|head)[^>]*>[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()

export const getLesson = (part: Part): Lesson => {
    const text  = `${part.properties.family ?? ''} ${part.title}`.toLowerCase()
    const found = LESSONS.find(([pattern]) => pattern.test(text))?.[1]
    const about = plain(part.description)

    return found ?? { what: about.length > MAX_TEXT ? `${about.slice(0, MAX_TEXT)}…` : about || part.title, how: 'A folha de dados da peça diz o que cada pino faz; os pinos e as nets estão logo abaixo.', formula: '', live: () => [] }
}
