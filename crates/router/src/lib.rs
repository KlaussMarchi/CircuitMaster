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
}

const CROSS_COST: u32 = 4;    // PASSO EXTRA AO CRUZAR UM FIO RETO ALHEIO (SÓ NO ESQUEMÁTICO)
const ACROSS: u8 = 1;         // CÉLULA DE FIO RETO HORIZONTAL
const ALONG: u8 = 2;          // CÉLULA DE FIO RETO VERTICAL

type Box = (usize, usize, usize, usize);

// GRADE DE ROTEAMENTO: DONO DE CADA CÉLULA (LIVRE, BLOQUEADA OU NET), PADS POR NET, VIZINHANÇA A EVITAR E O ESTADO DA BUSCA A*
struct Grid<'a> {
    width: usize,
    height: usize,
    layers: usize,
    owner: Vec<i32>,
    pads: &'a [i32],
    near: Vec<i32>,
    straight: Vec<u8>,
    cost: Vec<u32>,
    parent: Vec<u32>,
    seen: Vec<u32>,
    goal: Vec<u32>,
    generation: u32,
}

impl<'a> Grid<'a> {
    fn new(width: usize, height: usize, layers: usize, owner: &[i32], pads: &'a [i32]) -> Self {
        let size = width * height * layers;
        Grid { width, height, layers, owner: owner.to_vec(), pads, near: vec![FREE; size], straight: vec![0; size], cost: vec![0; size], parent: vec![NONE; size], seen: vec![0; size], goal: vec![0; size], generation: 0 }
    }

    fn place(&self, index: usize) -> (usize, usize, usize) {
        let plane = self.width * self.height;
        (index % self.width, (index % plane) / self.width, index / plane)
    }

    fn index(&self, x: usize, y: usize, layer: usize) -> usize {
        (layer * self.height + y) * self.width + x
    }

    fn enterable(&self, index: usize, allowed: &[i32]) -> bool {
        self.owner[index] == FREE || allowed.contains(&self.owner[index]) || allowed.contains(&self.pads[index])
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

    // A* MULTI-ORIGEM SÓ PELAS CÉLULAS DA ÁRVORE E DO ALVO: PASSO 1 EM 4 DIREÇÕES, +avoid NA VIZINHANÇA ALHEIA, +via NA TROCA DE CAMADA; HEURÍSTICA DE MANHATTAN ATÉ A CAIXA DO ALVO
    fn search(&mut self, sources: &[usize], targets: &[usize], allowed: &[i32], params: &Params) -> Option<Vec<usize>> {
        self.generation += 1;
        let generation = self.generation;
        let (x0, y0, x1, y1) = self.bounds(targets);
        let gap = |value: usize, low: usize, high: usize| if value < low { low - value } else if value > high { value - high } else { 0 };
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
                heap.push(Reverse(((gap(x, x0, x1) + gap(y, y0, y1)) as u32, source)));
            }
        }

        while let Some(Reverse((estimate, index))) = heap.pop() {
            let (x, y, layer) = self.place(index);

            if estimate > self.cost[index] + (gap(x, x0, x1) + gap(y, y0, y1)) as u32 {
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

            let mut moves: Vec<(usize, u32)> = Vec::with_capacity(9);

            for (dx, dy, wire) in [(-1isize, 0isize, ALONG), (1, 0, ALONG), (0, -1, ACROSS), (0, 1, ACROSS)] {
                let (nx, ny) = (x as isize + dx, y as isize + dy);
                let (fx, fy) = (x as isize + 2 * dx, y as isize + 2 * dy);

                if nx < 0 || ny < 0 || nx >= self.width as isize || ny >= self.height as isize {
                    continue;
                }

                let next = self.index(nx as usize, ny as usize, layer);
                moves.push((next, 1));

                if params.crossings && self.straight[next] == wire && !self.enterable(next, allowed) && fx >= 0 && fy >= 0 && fx < self.width as isize && fy < self.height as isize {
                    moves.push((self.index(fx as usize, fy as usize, layer), 2 + CROSS_COST));
                }
            }

            if params.vias && self.layers == 2 && self.via_fits(x, y, allowed, params.via_fit) {
                moves.push((self.index(x, y, 1 - layer), params.via_cost));
            }

            for (next, step) in moves {
                if !self.enterable(next, allowed) {
                    continue;
                }

                let avoid = if self.near[next] != FREE && !allowed.contains(&self.near[next]) { params.avoid_cost } else { 0 };
                let total = self.cost[index] + step + avoid;

                if self.seen[next] == generation && total >= self.cost[next] {
                    continue;
                }

                let (nx, ny, _) = self.place(next);
                self.seen[next] = generation;
                self.cost[next] = total;
                self.parent[next] = index as u32;
                heap.push(Reverse((total + (gap(nx, x0, x1) + gap(ny, y0, y1)) as u32, next)));
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
    fn commit(&mut self, path: &[usize], allowed: &[i32], params: &Params) {
        for (i, &index) in path.iter().enumerate() {
            let (x, y, layer) = self.place(index);
            self.mark(x, y, layer, allowed, params.trace_mark);

            if i > 0 && self.place(path[i - 1]).2 != layer {
                for side in 0..self.layers {
                    self.mark(x, y, side, allowed, params.via_mark);
                }
            }

            if i > 0 && (self.place(path[i - 1]).0 as isize - x as isize).abs() + (self.place(path[i - 1]).1 as isize - y as isize).abs() == 2 {
                let crossed = (path[i - 1] + index) / 2;
                self.straight[crossed] = 0;
            }

            if i == 0 || i + 1 == path.len() {
                continue;
            }

            let (px, py, _) = self.place(path[i - 1]);
            let (qx, qy, _) = self.place(path[i + 1]);
            self.straight[index] = if py == y && qy == y { ACROSS } else if px == x && qx == x { ALONG } else { 0 };
        }
    }

    // LIGA AS SUBNETS DE UMA NET: A ÁRVORE COMEÇA NA PRIMEIRA E CRESCE PELA SUBNET MAIS PRÓXIMA; AS OUTRAS SUBNETS SÃO OBSTÁCULO ATÉ SEREM LIGADAS
    fn route_net(&mut self, net: i32, groups: &[(i32, Vec<usize>)], params: &Params, paths: &mut Vec<(i32, Vec<usize>)>) -> usize {
        let mut tree = groups[0].1.clone();
        let mut allowed = vec![groups[0].0];
        let mut remaining: Vec<usize> = (1..groups.len()).collect();
        let mut connected = 0;

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

            if let Some(path) = self.search(&tree, cells, &reach, params) {
                self.commit(&path, &reach, params);
                tree.extend(path.iter());
                tree.extend(cells.iter());
                allowed = reach;
                paths.push((net, path));
                connected += 1;
            }
        }

        connected
    }
}

// UM CICLO DO ROTEADOR NA ORDEM DADA: nets = [n, (id, subnets, (subnet, células, índices…)…)…]; DEVOLVE [ligadas, pedidas, vias, falhas, ids…, caminhos, (id, n, índices…)…]
#[no_mangle]
pub unsafe extern "C" fn route(width: u32, height: u32, layers: u32, owner: *const i32, pads: *const i32, nets: *const i32, length: u32, params: *const f64, size: *mut u32) -> *mut i32 {
    let cells = (width * height * layers) as usize;
    let owner = slice::from_raw_parts(owner, cells);
    let pads = slice::from_raw_parts(pads, cells);
    let nets = slice::from_raw_parts(nets, length as usize);
    let values = slice::from_raw_parts(params, 7);
    let params = Params { via_cost: values[0] as u32, avoid_cost: values[1] as u32, trace_mark: values[2], via_fit: values[3], via_mark: values[4], vias: values[5] != 0.0, crossings: values[6] != 0.0 };
    let mut grid = Grid::new(width as usize, height as usize, layers as usize, owner, pads);
    let mut paths: Vec<(i32, Vec<usize>)> = Vec::new();
    let mut failed: Vec<i32> = Vec::new();
    let (mut connected, mut requested, mut at) = (0usize, 0usize, 1usize);

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

        if groups.len() < 2 {
            continue;
        }

        let done = grid.route_net(net, &groups, &params, &mut paths);
        connected += done;
        requested += groups.len() - 1;

        if done < groups.len() - 1 {
            failed.push(net);
        }
    }

    let plane = (width * height) as usize;
    let vias = paths.iter().map(|(_, path)| path.windows(2).filter(|pair| pair[0] / plane != pair[1] / plane).count()).sum::<usize>();
    let mut output = vec![connected as i32, requested as i32, vias as i32, failed.len() as i32];
    output.extend(failed.iter());
    output.push(paths.len() as i32);

    for (net, path) in &paths {
        output.push(*net);
        output.push(path.len() as i32);
        output.extend(path.iter().map(|&index| index as i32));
    }

    let pointer = alloc(output.len() * 4) as *mut i32;
    slice::from_raw_parts_mut(pointer, output.len()).copy_from_slice(&output);
    *size = output.len() as u32;
    pointer
}
