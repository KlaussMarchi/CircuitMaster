#![allow(non_snake_case)]

use std::cmp::Reverse;
use std::collections::BinaryHeap;
use std::slice;

const FREE: i32 = -1;
const BLOCKED: i32 = -2;
const NONE: u32 = u32::MAX;

fn words(bytes: usize) -> usize {
    (bytes + 7) / 8
}

// BUFFER ALINHADO EM 8 BYTES PARA AS VISÕES Int32Array E Float64Array DO LADO JS
#[no_mangle]
pub extern "C" fn alloc(bytes: usize) -> *mut u8 {
    let mut buffer = Vec::<u64>::with_capacity(words(bytes));
    let pointer = buffer.as_mut_ptr();
    std::mem::forget(buffer);
    pointer as *mut u8
}

#[no_mangle]
pub unsafe extern "C" fn release(pointer: *mut u8, bytes: usize) {
    drop(Vec::from_raw_parts(pointer as *mut u64, 0, words(bytes)));
}

struct Params {
    via_cost: u32,
    avoid_cost: u32,
    trace_mark: f64,
    via_fit: f64,
    via_mark: f64,
    vias: bool,
    crossings: bool,
    diagonals: bool,
}

const CROSS_COST: u32 = 4;    // PASSO EXTRA AO CRUZAR UM FIO RETO ALHEIO (SÓ NO ESQUEMÁTICO)
const ACROSS: u8 = 1;         // CÉLULA DE FIO RETO HORIZONTAL
const ALONG: u8 = 2;          // CÉLULA DE FIO RETO VERTICAL
const UNIT: u32 = 10;         // PASSO ORTOGONAL; OS CUSTOS DE Params SÃO EM PASSOS E SÃO MULTIPLICADOS POR ELE
const DIAGONAL: u32 = 14;     // PASSO A 45° (≈ UNIT·√2)
const TURN: [u32; 5] = [0, 3, 6, 40, 1000];    // CURVA DE 0°, 45°, 90°, 135° E 180°: MENOS DOBRAS E SEM ÂNGULO AGUDO
const STILL: u8 = 8;          // SEM DIREÇÃO DE CHEGADA (ORIGEM OU VIA)

// DIREÇÕES REGULARES EM SENTIDO HORÁRIO: A DIFERENÇA DE ÍNDICES É O ÂNGULO EM PASSOS DE 45°; ÍMPAR = DIAGONAL
const DIRECTIONS: [(isize, isize); 8] = [(1, 0), (1, 1), (0, 1), (-1, 1), (-1, 0), (-1, -1), (0, -1), (1, -1)];

fn turn(from: u8, to: u8) -> u32 {
    if from == STILL || to == STILL {
        return 0;
    }

    let diff = (from as usize + 8 - to as usize) % 8;
    TURN[diff.min(8 - diff)]
}

fn heading_of(dx: isize, dy: isize) -> u8 {
    DIRECTIONS.iter().position(|&d| d == (dx.signum(), dy.signum())).map_or(STILL, |d| d as u8)
}

type Box = (usize, usize, usize, usize);

const RIP_COST: u32 = 30;     // PASSO EXTRA POR CÉLULA DE TRILHA ALHEIA NO MODO BRANDO
const ROUNDS: usize = 40;     // RODADAS DE RIP-UP POR CICLO

// CAMINHOS ACEITOS DE UMA NET, CADA UM COM AS SUBNETS QUE ELE PODIA TOCAR, E QUANTAS LIGAÇÕES ELES FAZEM
#[derive(Clone, Default)]
struct Route {
    paths: Vec<(Vec<usize>, Vec<i32>)>,
    connected: usize,
}

// GRADE DE ROTEAMENTO: DONO DE CADA CÉLULA (LIVRE, BLOQUEADA OU NET), PADS POR NET, VIZINHANÇA A EVITAR E O ESTADO DA BUSCA A*
struct Grid<'a> {
    width: usize,
    height: usize,
    layers: usize,
    base: &'a [i32],
    owner: Vec<i32>,
    pads: &'a [i32],
    near: Vec<i32>,
    straight: Vec<u8>,
    center: Vec<i32>,
    history: Vec<u32>,
    soft: bool,
    victims: Vec<i32>,
    cost: Vec<u32>,
    parent: Vec<u32>,
    heading: Vec<u8>,
    seen: Vec<u32>,
    goal: Vec<u32>,
    generation: u32,
}

impl<'a> Grid<'a> {
    fn new(width: usize, height: usize, layers: usize, owner: &'a [i32], pads: &'a [i32]) -> Self {
        let size = width * height * layers;
        Grid { width, height, layers, base: owner, owner: owner.to_vec(), pads, near: vec![FREE; size], straight: vec![0; size], center: vec![FREE; size], history: vec![0; size], soft: false, victims: Vec::new(), cost: vec![0; size], parent: vec![NONE; size], heading: vec![STILL; size], seen: vec![0; size], goal: vec![0; size], generation: 0 }
    }

    // CÉLULA OCUPADA POR TRILHA JÁ ROTEADA DE OUTRA NET, MAS LIVRE DE OBSTÁCULO FIXO: NO MODO BRANDO (RIP-UP) PODE SER ATRAVESSADA
    fn taken(&self, index: usize, allowed: &[i32]) -> bool {
        self.soft && self.owner[index] != FREE && !allowed.contains(&self.owner[index]) && !allowed.contains(&self.pads[index]) && (self.base[index] == FREE || allowed.contains(&self.base[index]))
    }

    // VOLTA AO ESTADO SEM TRILHAS E MARCA DE NOVO OS CAMINHOS GUARDADOS, NA ORDEM EM QUE FORAM ACEITOS
    fn rebuild(&mut self, order: &[usize], routes: &[Route], params: &Params) {
        self.owner.copy_from_slice(self.base);
        self.near.fill(FREE);
        self.straight.fill(0);
        self.center.fill(FREE);

        for &k in order {
            for (path, reach) in &routes[k].paths {
                self.commit(path, reach, params, k as i32);
            }
        }
    }

    // PASSO DE UMA CÉLULA NA DIREÇÃO d; A DIAGONAL SÓ VALE SE AS DUAS CÉLULAS ORTOGONAIS DA QUINA TAMBÉM FOREM ACESSÍVEIS (NÃO CORTA A QUINA DE UM OBSTÁCULO)
    fn step(&self, index: usize, d: u8, allowed: &[i32]) -> Option<usize> {
        let (x, y, layer) = self.place(index);
        let (dx, dy) = DIRECTIONS[d as usize];
        let (nx, ny) = (x as isize + dx, y as isize + dy);

        if nx < 0 || ny < 0 || nx >= self.width as isize || ny >= self.height as isize {
            return None;
        }

        let next = self.index(nx as usize, ny as usize, layer);

        if !self.enterable(next, allowed) || (d % 2 == 1 && (!self.enterable(self.index(nx as usize, y, layer), allowed) || !self.enterable(self.index(x, ny as usize, layer), allowed))) {
            return None;
        }

        Some(next)
    }

    // TRECHO RETO (0°, 45° OU 90°) DE a ATÉ b NA MESMA CAMADA, SEM a; None SE NÃO É REGULAR OU ESBARRA EM ALGO
    fn line(&self, a: usize, b: usize, allowed: &[i32]) -> Option<(Vec<usize>, u8)> {
        let (ax, ay, _) = self.place(a);
        let (bx, by, _) = self.place(b);
        let (dx, dy) = (bx as isize - ax as isize, by as isize - ay as isize);

        if dx != 0 && dy != 0 && dx.abs() != dy.abs() {
            return None;
        }

        let d = heading_of(dx, dy);
        let mut cells = Vec::with_capacity(dx.abs().max(dy.abs()) as usize);
        let mut at = a;

        while at != b {
            at = self.step(at, d, allowed)?;
            cells.push(at);
        }

        Some((cells, d))
    }

    // LIGAÇÃO REGULAR MAIS CURTA DE a ATÉ b: UM TRECHO RETO OU DOIS (DIAGONAL + ORTOGONAL; SÓ ORTOGONAIS SEM DIAGONAIS), SEM CURVA AGUDA NA SAÍDA DE a
    fn connect(&self, a: usize, b: usize, came: u8, allowed: &[i32], diagonals: bool) -> Option<(Vec<usize>, u8)> {
        let (ax, ay, layer) = self.place(a);
        let (bx, by, _) = self.place(b);
        let (dx, dy) = (bx as isize - ax as isize, by as isize - ay as isize);
        let m = dx.abs().min(dy.abs());
        let knees: Vec<(isize, isize)> = if dx == 0 || dy == 0 || dx.abs() == dy.abs() {
            vec![(dx, dy)]
        } else if diagonals {
            vec![(dx.signum() * m, dy.signum() * m), (dx - dx.signum() * m, dy - dy.signum() * m)]
        } else {
            vec![(dx, 0), (0, dy)]
        };
        let mut found: Option<(Vec<usize>, u8)> = None;

        for (kx, ky) in knees {
            let first = heading_of(kx, ky);

            if turn(came, first) >= TURN[3] || (found.is_some() && first != came) {
                continue;
            }

            let knee = self.index((ax as isize + kx) as usize, (ay as isize + ky) as usize, layer);
            let Some((mut cells, _)) = self.line(a, knee, allowed) else { continue };
            let last = if knee == b { first } else {
                let Some((rest, last)) = self.line(knee, b, allowed) else { continue };
                cells.extend(rest);
                last
            };

            found = Some((cells, last));
        }

        found
    }

    // GLOSS: EM CADA CAMADA, LIGA CADA QUINA À QUINA MAIS ADIANTE QUE ELA ALCANÇA COM UMA LIGAÇÃO REGULAR LIVRE; SEM ATALHO, MANTÉM O TRECHO ORIGINAL (QUE PODE TER CRUZAMENTO)
    // ponytail: O(quinas² · comprimento) por caminho; se aparecerem caminhos com milhares de quinas, limitar a janela de j
    fn gloss(&self, path: &[usize], allowed: &[i32], diagonals: bool) -> Vec<usize> {
        let plane = self.width * self.height;
        let mut output = Vec::with_capacity(path.len());
        let mut start = 0;

        for end in 1..=path.len() {
            if end < path.len() && path[end] / plane == path[end - 1] / plane {
                continue;
            }

            let run = &path[start..end];
            let direction = |k: usize| {
                let ((x0, y0, _), (x1, y1, _)) = (self.place(run[k]), self.place(run[k + 1]));
                heading_of(x1 as isize - x0 as isize, y1 as isize - y0 as isize)
            };
            let corners: Vec<usize> = (0..run.len()).filter(|&k| k == 0 || k + 1 == run.len() || direction(k - 1) != direction(k)).collect();
            let (mut i, mut came) = (0, STILL);
            output.push(run[0]);

            while i + 1 < corners.len() {
                match (i + 2..corners.len()).rev().find_map(|j| self.connect(run[corners[i]], run[corners[j]], came, allowed, diagonals).map(|found| (j, found))) {
                    Some((j, (cells, last))) => {
                        output.extend(cells);
                        came = last;
                        i = j;
                    }
                    None => {
                        output.extend(&run[corners[i] + 1..=corners[i + 1]]);
                        came = direction(corners[i + 1] - 1);
                        i += 1;
                    }
                }
            }

            start = end;
        }

        output
    }

    fn place(&self, index: usize) -> (usize, usize, usize) {
        let plane = self.width * self.height;
        (index % self.width, (index % plane) / self.width, index / plane)
    }

    fn index(&self, x: usize, y: usize, layer: usize) -> usize {
        (layer * self.height + y) * self.width + x
    }

    fn enterable(&self, index: usize, allowed: &[i32]) -> bool {
        self.owner[index] == FREE || allowed.contains(&self.owner[index]) || allowed.contains(&self.pads[index]) || self.taken(index, allowed)
    }

    // A VIA CABE SE O DISCO DE RAIO r EM VOLTA DA CÉLULA É ACESSÍVEL ÀS SUBNETS PERMITIDAS NAS DUAS CAMADAS
    fn via_fits(&self, x: usize, y: usize, allowed: &[i32], radius: f64) -> bool {
        let r = radius.ceil() as isize;

        for layer in 0..self.layers {
            for dy in -r..=r {
                for dx in -r..=r {
                    if ((dx * dx + dy * dy) as f64) > radius * radius {
                        continue;
                    }

                    let (cx, cy) = (x as isize + dx, y as isize + dy);

                    if cx < 0 || cy < 0 || cx >= self.width as isize || cy >= self.height as isize || !self.enterable(self.index(cx as usize, cy as usize, layer), allowed) {
                        return false;
                    }
                }
            }
        }

        true
    }

    fn bounds(&self, cells: &[usize]) -> Box {
        cells.iter().fold((usize::MAX, usize::MAX, 0, 0), |(x0, y0, x1, y1), &index| {
            let (x, y, _) = self.place(index);
            (x0.min(x), y0.min(y), x1.max(x), y1.max(y))
        })
    }

    // A* MULTI-ORIGEM SÓ PELAS CÉLULAS DA ÁRVORE E DO ALVO: PASSO EM 4 OU 8 DIREÇÕES REGULARES COM CUSTO DE CURVA, +avoid NA VIZINHANÇA ALHEIA, +via NA TROCA DE CAMADA; HEURÍSTICA OCTOGONAL (OU MANHATTAN) ATÉ A CAIXA DO ALVO
    fn search(&mut self, sources: &[usize], targets: &[usize], allowed: &[i32], params: &Params) -> Option<Vec<usize>> {
        self.generation += 1;
        let generation = self.generation;
        let (x0, y0, x1, y1) = self.bounds(targets);
        let gap = |value: usize, low: usize, high: usize| if value < low { low - value } else if value > high { value - high } else { 0 };
        let diagonals = params.diagonals;
        let estimate = move |x: usize, y: usize| {
            let (dx, dy) = (gap(x, x0, x1) as u32, gap(y, y0, y1) as u32);
            if diagonals { DIAGONAL * dx.min(dy) + UNIT * (dx.max(dy) - dx.min(dy)) } else { UNIT * (dx + dy) }
        };
        let mut heap = BinaryHeap::new();

        for &target in targets {
            self.goal[target] = generation;
        }

        for &source in sources {
            if self.enterable(source, allowed) && self.seen[source] != generation {
                let (x, y, _) = self.place(source);
                self.seen[source] = generation;
                self.cost[source] = 0;
                self.parent[source] = NONE;
                self.heading[source] = STILL;
                heap.push(Reverse((estimate(x, y), source)));
            }
        }

        while let Some(Reverse((guess, index))) = heap.pop() {
            let (x, y, layer) = self.place(index);

            if guess > self.cost[index] + estimate(x, y) {
                continue;
            }

            if self.goal[index] == generation {
                let mut path = vec![index];

                while self.parent[*path.last().unwrap()] != NONE {
                    path.push(self.parent[*path.last().unwrap()] as usize);
                }

                path.reverse();
                return Some(path);
            }

            let came = self.heading[index];
            let mut moves: Vec<(usize, u32, u8)> = Vec::with_capacity(9);

            for d in (0..8u8).filter(|d| diagonals || d % 2 == 0) {
                let (dx, dy) = DIRECTIONS[d as usize];

                if let Some(next) = self.step(index, d, allowed) {
                    moves.push((next, if d % 2 == 1 { DIAGONAL } else { UNIT } + turn(came, d), d));
                    continue;
                }

                // CRUZAMENTO: SALTA UMA CÉLULA DE FIO RETO ALHEIO PERPENDICULAR AO PASSO
                let (nx, ny) = (x as isize + dx, y as isize + dy);
                let (fx, fy) = (x as isize + 2 * dx, y as isize + 2 * dy);
                let wire = if dx != 0 { ALONG } else { ACROSS };

                if params.crossings && d % 2 == 0 && fx >= 0 && fy >= 0 && fx < self.width as isize && fy < self.height as isize && self.straight[self.index(nx as usize, ny as usize, layer)] == wire {
                    moves.push((self.index(fx as usize, fy as usize, layer), (2 + CROSS_COST) * UNIT + turn(came, d), d));
                }
            }

            if params.vias && self.layers == 2 && self.via_fits(x, y, allowed, params.via_fit) {
                moves.push((self.index(x, y, 1 - layer), params.via_cost * UNIT, STILL));
            }

            for (next, step, d) in moves {
                if !self.enterable(next, allowed) {
                    continue;
                }

                let avoid = if self.near[next] != FREE && !allowed.contains(&self.near[next]) { params.avoid_cost * UNIT } else { 0 };
                let rip = if self.taken(next, allowed) { RIP_COST * UNIT + self.history[next] } else { 0 };
                let total = self.cost[index] + step + avoid + rip;

                if self.seen[next] == generation && total >= self.cost[next] {
                    continue;
                }

                let (nx, ny, _) = self.place(next);
                self.seen[next] = generation;
                self.cost[next] = total;
                self.parent[next] = index as u32;
                self.heading[next] = d;
                heap.push(Reverse((total + estimate(nx, ny), next)));
            }
        }

        None
    }

    // DISCO DA ÁRVORE EM VOLTA DE UMA CÉLULA: LIVRE OU DA ÁRVORE VIRA DA ÁRVORE, ALHEIA VIRA BLOQUEADA; O ANEL SEGUINTE VIRA VIZINHANÇA A EVITAR
    fn mark(&mut self, x: usize, y: usize, layer: usize, allowed: &[i32], radius: f64) {
        let tree = allowed[0];
        let r = radius.ceil() as isize + 1;

        for dy in -r..=r {
            for dx in -r..=r {
                let (cx, cy) = (x as isize + dx, y as isize + dy);
                let distance = ((dx * dx + dy * dy) as f64).sqrt();

                if cx < 0 || cy < 0 || cx >= self.width as isize || cy >= self.height as isize || distance > radius + 1.0 {
                    continue;
                }

                let index = self.index(cx as usize, cy as usize, layer);

                if distance <= radius {
                    self.owner[index] = if self.owner[index] == FREE || allowed.contains(&self.owner[index]) { tree } else { BLOCKED };
                    continue;
                }

                self.near[index] = if self.near[index] == FREE || allowed.contains(&self.near[index]) { tree } else { BLOCKED };
            }
        }
    }

    // MARCA O CAMINHO; CÉLULA RETA DO CAMINHO PODE SER CRUZADA DEPOIS, CÉLULA JÁ CRUZADA NÃO PODE MAIS
    fn commit(&mut self, path: &[usize], allowed: &[i32], params: &Params, who: i32) {
        for (i, &index) in path.iter().enumerate() {
            let (x, y, layer) = self.place(index);
            self.mark(x, y, layer, allowed, params.trace_mark);
            self.center[index] = who;

            if i > 0 && self.place(path[i - 1]).2 != layer {
                for side in 0..self.layers {
                    self.mark(x, y, side, allowed, params.via_mark);
                }
            }

            let (px, py, _) = if i > 0 { self.place(path[i - 1]) } else { (x, y, layer) };

            if (px == x || py == y) && (px as isize - x as isize).abs() + (py as isize - y as isize).abs() == 2 {
                let crossed = (path[i - 1] + index) / 2;
                self.straight[crossed] = 0;
            }

            if i == 0 || i + 1 == path.len() {
                continue;
            }

            let (qx, qy, _) = self.place(path[i + 1]);
            self.straight[index] = if py == y && qy == y { ACROSS } else if px == x && qx == x { ALONG } else { 0 };
        }
    }

    // LIGA AS SUBNETS DE UMA NET: A ÁRVORE COMEÇA NA PRIMEIRA E CRESCE PELA SUBNET MAIS PRÓXIMA; AS OUTRAS SUBNETS SÃO OBSTÁCULO ATÉ SEREM LIGADAS
    // NO MODO BRANDO, AS NETS DONAS DE TRILHAS ATRAVESSADAS PELO CAMINHO VÃO PARA victims (PELOS CENTROS DE CAMINHO NO DISCO DE MARCAÇÃO)
    fn route_net(&mut self, who: i32, groups: &[(i32, Vec<usize>)], params: &Params) -> Route {
        let mut tree = groups[0].1.clone();
        let mut allowed = vec![groups[0].0];
        let mut remaining: Vec<usize> = (1..groups.len()).collect();
        let mut route = Route::default();
        let r = params.trace_mark.max(params.via_mark).ceil() as isize + 1;

        while !remaining.is_empty() {
            let (tx0, ty0, tx1, ty1) = self.bounds(&tree);
            let distance = |cells: &Vec<usize>| {
                let (x0, y0, x1, y1) = self.bounds(cells);
                x0.saturating_sub(tx1) + tx0.saturating_sub(x1) + y0.saturating_sub(ty1) + ty0.saturating_sub(y1)
            };
            let position = (0..remaining.len()).min_by_key(|&i| distance(&groups[remaining[i]].1)).unwrap();
            let (target, cells) = &groups[remaining.remove(position)];
            let mut reach = allowed.clone();
            reach.push(*target);

            if let Some(found) = self.search(&tree, cells, &reach, params) {
                let path = if self.soft { found } else { self.gloss(&found, &reach, params.diagonals) };

                let disputed: Vec<usize> = path.iter().copied().filter(|&index| self.taken(index, &reach)).collect();

                for index in disputed {
                    let (x, y, layer) = self.place(index);
                    self.history[index] += UNIT;

                    for cy in (y as isize - r).max(0)..=(y as isize + r).min(self.height as isize - 1) {
                        for cx in (x as isize - r).max(0)..=(x as isize + r).min(self.width as isize - 1) {
                            let owner = self.center[self.index(cx as usize, cy as usize, layer)];

                            if owner != FREE && owner != who && !self.victims.contains(&owner) {
                                self.victims.push(owner);
                            }
                        }
                    }
                }

                self.commit(&path, &reach, params, who);
                tree.extend(path.iter());
                tree.extend(cells.iter());
                allowed = reach.clone();
                route.paths.push((path, reach));
                route.connected += 1;
            }
        }

        route
    }
}

fn score(routes: &[Route], plane: usize) -> (usize, usize) {
    let vias = routes.iter().flat_map(|route| route.paths.iter()).map(|(path, _)| path.windows(2).filter(|pair| pair[0] / plane != pair[1] / plane).count()).sum::<usize>();
    (routes.iter().map(|route| route.connected).sum(), vias)
}

// UM CICLO DO ROTEADOR NA ORDEM DADA: nets = [n, (id, subnets, (subnet, células, índices…)…)…]; DEVOLVE [ligadas, pedidas, vias, falhas, ids…, caminhos, (id, n, índices…)…]
#[no_mangle]
pub unsafe extern "C" fn route(width: u32, height: u32, layers: u32, owner: *const i32, pads: *const i32, nets: *const i32, length: u32, params: *const f64, size: *mut u32) -> *mut i32 {
    let cells = (width * height * layers) as usize;
    let owner = slice::from_raw_parts(owner, cells);
    let pads = slice::from_raw_parts(pads, cells);
    let nets = slice::from_raw_parts(nets, length as usize);
    let values = slice::from_raw_parts(params, 8);
    let params = Params { via_cost: values[0] as u32, avoid_cost: values[1] as u32, trace_mark: values[2], via_fit: values[3], via_mark: values[4], vias: values[5] != 0.0, crossings: values[6] != 0.0, diagonals: values[7] != 0.0 };
    let mut grid = Grid::new(width as usize, height as usize, layers as usize, owner, pads);
    let mut list: Vec<(i32, Vec<(i32, Vec<usize>)>)> = Vec::new();
    let mut at = 1usize;

    for _ in 0..nets[0] {
        let net = nets[at];
        let count = nets[at + 1] as usize;
        let mut groups: Vec<(i32, Vec<usize>)> = Vec::with_capacity(count);
        at += 2;

        for _ in 0..count {
            let n = nets[at + 1] as usize;
            groups.push((nets[at], nets[at + 2..at + 2 + n].iter().map(|&index| index as usize).collect()));
            at += 2 + n;
        }

        if groups.len() >= 2 {
            list.push((net, groups));
        }
    }

    // PRIMEIRA PASSADA NA ORDEM DADA
    let plane = (width * height) as usize;
    let mut routes: Vec<Route> = vec![Route::default(); list.len()];
    let mut order: Vec<usize> = Vec::with_capacity(list.len());

    for (k, (_, groups)) in list.iter().enumerate() {
        routes[k] = grid.route_net(k as i32, groups, &params);
        order.push(k);
    }

    // RIP-UP: A NET QUE FALHOU ROTEIA NO MODO BRANDO, AS NETS QUE ELA ATRAVESSA SAEM, ELA ENTRA E ELAS VOLTAM; O HISTÓRICO DAS CÉLULAS DISPUTADAS ENCARECE A DISPUTA SEGUINTE; FICA O MELHOR ESTADO
    let incomplete = |routes: &[Route]| (0..list.len()).filter(|&k| routes[k].connected + 1 < list[k].1.len()).collect::<Vec<usize>>();
    let mut best = (score(&routes, plane), routes.clone(), order.clone());
    let mut hopeless: Vec<usize> = Vec::new();

    for round in 0..ROUNDS {
        let pending: Vec<usize> = incomplete(&routes).into_iter().filter(|k| !hopeless.contains(k)).collect();

        if pending.is_empty() {
            break;
        }

        let k = pending[round % pending.len()];
        order.retain(|&o| o != k);
        routes[k] = Route::default();
        grid.rebuild(&order, &routes, &params);
        grid.soft = true;
        grid.victims.clear();
        let trial = grid.route_net(k as i32, &list[k].1, &params);
        grid.soft = false;
        let victims: Vec<usize> = grid.victims.iter().map(|&v| v as usize).collect();

        if victims.is_empty() && trial.connected + 1 < list[k].1.len() {
            hopeless.push(k);
        }

        order.retain(|o| !victims.contains(o));
        victims.iter().for_each(|&v| routes[v] = Route::default());
        grid.rebuild(&order, &routes, &params);

        for &n in std::iter::once(&k).chain(victims.iter()) {
            routes[n] = grid.route_net(n as i32, &list[n].1, &params);
            order.push(n);
        }

        let current = score(&routes, plane);

        if current.0 > best.0 .0 || (current.0 == best.0 .0 && current.1 < best.0 .1) {
            best = (current, routes.clone(), order.clone());
        }
    }

    let ((connected, vias), routes, order) = best;
    let requested: usize = list.iter().map(|(_, groups)| groups.len() - 1).sum();
    let failed: Vec<i32> = incomplete(&routes).into_iter().map(|k| list[k].0).collect();
    let mut output = vec![connected as i32, requested as i32, vias as i32, failed.len() as i32];
    output.extend(failed.iter());
    output.push(order.iter().map(|&k| routes[k].paths.len()).sum::<usize>() as i32);

    for &k in &order {
        for (path, _) in &routes[k].paths {
            output.push(list[k].0);
            output.push(path.len() as i32);
            output.extend(path.iter().map(|&index| index as i32));
        }
    }

    let pointer = alloc(output.len() * 4) as *mut i32;
    slice::from_raw_parts_mut(pointer, output.len()).copy_from_slice(&output);
    *size = output.len() as u32;
    pointer
}
