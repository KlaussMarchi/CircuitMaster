#![allow(non_snake_case)]

use std::slice;

fn words(bytes: usize) -> usize {
    (bytes + 7) / 8
}

// BUFFER ALINHADO EM 8 BYTES PARA AS VISÕES Uint32Array E Float64Array DO LADO JS
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

fn find(parent: &mut [u32], node: u32) -> u32 {
    let mut x = node;
    while parent[x as usize] != x {
        let up = parent[parent[x as usize] as usize];
        parent[x as usize] = up;
        x = up;
    }
    x
}

// ROTULA CADA NÓ COM O MENOR ÍNDICE DA SUA COMPONENTE CONEXA (UNION-FIND COM MEIA COMPRESSÃO)
#[no_mangle]
pub unsafe extern "C" fn components(n: u32, edges: *const u32, m: u32, labels: *mut u32) {
    let edges = slice::from_raw_parts(edges, (2 * m) as usize);
    let labels = slice::from_raw_parts_mut(labels, n as usize);

    for (i, label) in labels.iter_mut().enumerate() {
        *label = i as u32;
    }

    for pair in edges.chunks_exact(2) {
        let a = find(labels, pair[0]);
        let b = find(labels, pair[1]);

        if a != b {
            labels[a.max(b) as usize] = a.min(b);
        }
    }

    for i in 0..n {
        labels[i as usize] = find(labels, i);
    }
}

// PRIM SOBRE O GRAFO COMPLETO: PESO 0 NA MESMA CLASSE, SENÃO DISTÂNCIA AO QUADRADO; DEVOLVE SÓ ARESTAS DE PESO > 0
#[no_mangle]
pub unsafe extern "C" fn spanningTree(k: u32, points: *const f64, classes: *const u32, pairs: *mut u32) -> u32 {
    let k = k as usize;
    let points = slice::from_raw_parts(points, 2 * k);
    let classes = slice::from_raw_parts(classes, k);
    let pairs = slice::from_raw_parts_mut(pairs, 2 * k);

    if k < 2 {
        return 0;
    }

    let weight = |i: usize, j: usize| {
        if classes[i] == classes[j] {
            return 0.0;
        }

        let dx = points[2 * i] - points[2 * j];
        let dy = points[2 * i + 1] - points[2 * j + 1];
        dx * dx + dy * dy
    };

    let mut done = vec![false; k];
    let mut best = vec![f64::INFINITY; k];
    let mut parent = vec![0usize; k];
    let mut count = 0;

    best[0] = 0.0;

    for _ in 0..k {
        let next = (0..k).filter(|&i| !done[i]).min_by(|&a, &b| best[a].total_cmp(&best[b])).unwrap();
        done[next] = true;

        if next != 0 && best[next] > 0.0 {
            pairs[2 * count] = next as u32;
            pairs[2 * count + 1] = parent[next] as u32;
            count += 1;
        }

        for j in 0..k {
            if !done[j] && weight(next, j) < best[j] {
                best[j] = weight(next, j);
                parent[j] = next;
            }
        }
    }

    count as u32
}
