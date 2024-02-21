#!/usr/bin/env node
import * as fs from 'fs'
import * as sb from 'structure-bytes'
import {Puzzle, puzzleType} from './types'

const {argv} = process
if (argv.length <= 2) {
	Error.stackTraceLimit = 0
	throw new Error('Usage: ' + argv[1].split('/').pop() + ' path/to/cagings.sbv')
}

const readPuzzle = new Promise<Puzzle>((resolve, reject) => {
	sb.readValue({
		type: puzzleType,
		inStream: fs.createReadStream(argv[2])
	}, (err, value) => {
		if (err) reject(err)
		else resolve(value!)
	})
})

readPuzzle.then((puzzle) => {
	// Output the puzzle in readable format
	const ltr = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnop'
	const {max, cages} = puzzle!
	let grid: string[] =
		[...Array(max).keys()].map(() => '.'.repeat(max))
	let n = -1
	for(const cage of cages) {
		if (cage.boxes.length > 1) n++
		for(const box of cage.boxes) {
			const [r, c] = box
			const chr = (cage.op === '=') ?
				String(cage.val) : ltr.substr(n,1)
			grid[r] = grid[r].substr(0,c) + chr +
				grid[r].substr(c+1)
		}
	}
	process.stdout.write('.KK "' + argv[2] + '"\n')
	grid.map((s) => process.stdout.write(s + '\n'))
	process.stdout.write('\n')
	n = 0
	for(const cage of cages) {
		if (cage.boxes.length === 1) continue
		const chr = ltr.substr(n,1)
		let op = (cage.op !== '*') ? cage.op : 'x'
		process.stdout.write(chr + ' ' + cage.val + op + '\n')
		n++
	}
})
.catch(console.error)
