// CATEGORIAS DO CATÁLOGO NA ORDEM EM QUE SE TESTAM NA FAMÍLIA, COM OS NOMES DOS GRUPOS DAS PEÇAS SUGERIDAS (SPEC 08 §6)
export const CATEGORIES: [string, RegExp][] = [
    ['Instrumentos', /\bmultimeter\b|oscilloscope|lab dc power supply|ammeter|voltmeter|ohmmeter|galvanometer|frequency counter/],
    ['Esquema e mecânica', /^power$|net ?label|net ?tie|graphic|mechanical|mounting|\bhole\b|\bframe\b|\blogo\b|ruler|fiducial|test ?point|\bnote\b|auxiliary items|heatsink|magnet\b|stand ?off|blocker|\bpad\b|\bvia\b|ground symbol|power symbol/],
    ['Placas e protótipo', /breadboard|perfboard|stripboard|vanilla pcb|\bpcb\b(?! jumper)|prototyp|breakout boards|\bshim\b/],
    ['Microcontroladores', /microcontroller|mikrocontroller|\bmcu\b|\bcpu\b|\bdsp\b|\bgpu\b|\bfpu\b|arduino|raspberry|teensy|esp8266|esp32|\bfeather|picaxe|basic stamp|atmega|attiny|\bpic uc|\b(avr|arm) uc\b|\barm\b|stm32|wemos|nodemcu|spresense|\bshield\b|picowbell|\bbff\b|calliope|chipkit|espruino|meadow|blend micro|rfduino|robot controller|xmos|p8x32|\bfrc\b|\bmetro\b|qt py|trinkey|gemma|trinket|fruit jam|trellis|sparkle motion|itsy ?bitsy|\bhat\b|bonnet/],
    ['Comunicação', /\brf\b|rfm\d|wi-?fi|bluetooth|xbee|\bgsm\b|zigbee|\bnfc\b|rfid|antenna|\blora\b|2\.4 ?ghz|tran?s?ceiver|transreceiver|\bgps\b|venus\d|cell module|fiber optic|\bradio\b|\bfm\b|transmitter|receiver|network ?module|bluefruit/],
    ['Sensores', /sensor|accelerometer|gyroscope|compass|magnetometer|photocell|\bldr\b|thermistor|thermocouple|hall ?(effect|generator)|\bimu\b|microphone|\bmic\b|camera|infrared|\btsop\b|load cell|geiger|heart rate|\bph\b|\borp\b|conductivity|dissolved oxygen|\bflow\b|\batlas\b|radiation|photomultiplier|\bsipm\b|\blsm\d|power monitor/],
    ['Conectores', /connector|header|\bjack\b|socket|terminal|picoblade|df13|\bmolex\b|lumberg|\bjst\b|\bplug\b|\brj\d|qwiic|\bjumper\b|^usb$|ctb01|sub-?d\b|\bdin\d?\b|mini-din|scart|microsd|smartcard|obdii|\bicsp\b|\biscp\b|usb (type|micro|mini)|type-?c\b|stemma|\bfpc\b|neutrik|\bdvi\b|eyespi/],
    ['Fontes', /regulator|battery|voltage source|power supply|step-?(down|up)|dc-?dc|converter|charger|\bldo\b|reference|power management|power protection|supervisor|sequencer|\bfuse\b|polyfuse|circuit ?breaker|solar|lipo|coin cell|boost|\bgdt\b|gas discharge|spark ?gap/],
    ['CIs', /\bic\b|amplifier|op-?amp|opamp|comparator|\btimer\b|\b555\b|logic|\bgates?\b|74xx|74xg|40xx|4xxx|4000 series|eprom|flash|memory|nvram|\bnand\b|\bram\b|\brom\b|\badc\b|\bdac\b|\ba2d\b|analog|mux|multiplexer|driver|interface|buffer|codec|\bpll\b|\brtc\b|fpga|cpld|isolator|level (translator|shifter)|schmitt|inverter|counter|decoder|equalizer|modulator|generator|controller|expander|shifter|\bftdi\b|usb[- ]?(to[- ])?serial|cp210|rs-?(232|485)|\bcan\b|1-wire|qspi|\bfram\b|uart|ethernet|hdmi|video|audio|potentiometer digital|security|^(sparkfun |adafruit )?[a-z]{2,5}\d{3,}\w*$/],
    ['Saída', /display|\blcd\b|oled|\btft\b|segment|matrix|motor|servo|stepper|solenoid|buzzer|speaker|earphone|headphone|piezo|relay|lamp|vibration|neopixel|heater|peltier|printer|player|e-?ink|actor\b|actuator/],
    ['Entrada', /switch|button|keypad|joystick|encoder|slider|trackball|neokey|touch ?screen/],
    ['Semicondutores', /diode|zener|schottky|\bdiac\b|\bled\b|light emitting|transistor|mosfet|\bj?fet\b|\bigbt\b|\bscr\b|triac|thyristor|bridge|opto|\bbjt\b|darlington|laser/],
    ['Passivos', /resistor|capacitor|\bcap\b|inductor|ferrite|crystal|oscillator|resonator|transformer|varistor|potentiometer|trimpot|\bchoke\b|filter|memristor|delay ?line|divider/]
]

// NO NOME E NA DESCRIÇÃO OS TERMOS DE PEÇA DISCRETA VÊM ANTES DOS DE CI: "gate" DO IGBT E "flash" DA LÂMPADA NÃO FAZEM DELES CIRCUITOS INTEGRADOS
const TEXT_ORDER = ['Instrumentos', 'Semicondutores', 'Passivos', 'Sensores', 'Comunicação', 'Fontes', 'Saída', 'Entrada', 'Microcontroladores', 'CIs', 'Conectores', 'Placas e protótipo', 'Esquema e mecânica']

export const OTHERS = 'Outros'
export const MISC   = 'Diversos'    // AS FAMÍLIAS PEQUENAS DE UMA CATEGORIA, JUNTAS

// NOME DA FAMÍLIA SEM O FABRICANTE NA FRENTE NEM "IC"/"series" NO FIM: "SparkFun Voltage Regulator" E "voltage regulator", "Timer IC" E "Timer" SÃO UMA FAMÍLIA SÓ NO CATÁLOGO
export const familyName = (family: string) => family.trim().replace(/^(sparkfun|adafruit)\s+/i, '').replace(/\s+(ics?|series)$/i, '')

const clean = (text: string) => text.toLowerCase().replaceAll('_', ' ').trim()

const inFamily = (family: string) => CATEGORIES.find(([, rule]) => rule.test(clean(family)))?.[0]

const inText = (text: string) => TEXT_ORDER.find(name => CATEGORIES.find(([category]) => category === name)?.[1].test(clean(text)))

// CATEGORIA DE UMA PEÇA DE QUALQUER ORIGEM: A FAMÍLIA (NO KICAD, A BIBLIOTECA) PRIMEIRO; SEM REGRA PARA ELA, O NOME E A DESCRIÇÃO
export const categoryOf = (family: string, text: string) => inFamily(family) ?? inText(text) ?? OTHERS
