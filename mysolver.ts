#!/usr/bin/env node
import * as fs from 'fs'
import {makeSolvingBoard} from './solve'
import {Op, Cage, Box, Puzzle} from './types'

const {argv} = process
if (argv.length <= 2)
	throw new Error('Usage: ./mysolver.js path/to/file')

const readPuzzle = new Promise<Puzzle>((resolve, reject) => {
	const txt = fs.readFileSync(argv[2],'utf8')
	let lines = 0
	function err(msg: string): void {
		throw new Error(msg + ' (line ' + lines + ')')
	}
	let max = 0, ltrs: string[] = [], cages: Cage[] = [], r = -1
	for (const l of txt.split('\n')) {
		lines += 1
		var tokens = l.split(' ')
		if (tokens[0] === '.KK') continue
		if (tokens.length > 1 || tokens[0].length == 0) break
		const t = tokens[0]
		if (max === 0) {
			if (t.length > 9) err('invalid grid format - 9x9 max')
			max = t.length 
		}
		if (t.length !== max) err('inconsistent grid format')
		r += 1
		if (r >= max) err('inconsistent grid format')
		for (let n=0; n<t.length; n++) {
			const c = t.substr(n,1)
			const ix = [...ltrs].map(l => l === c)
			var cage: Cage
			if (/^[1-9]$/.test(c)) {
				// A fixed digit - separate box
				ltrs.push('0')
				cage = {
					op: '=',
					val: Number(c),
					boxes: []
				}
				cages.push(cage)
			} else if (!ix.some(Boolean)) {
				// new cage - new letter
				ltrs.push(c)
				cage = {
					op: '=',
					val: 0,
					boxes: []
				}
				cages.push(cage)
			} else {
				// existing cage - get it
				cage = cages[ ix.indexOf(true) ]
			}
			let box: Box = [r,n]
			cage.boxes.push(box)
		}
	}


	// Done with defining grid, now do the op and values
	lines -= 1
	const unread = txt.split('\n').filter((_,ix) => ix >= lines)
	let todo = ltrs
	for (const l of unread) {
		lines += 1
		var tokens = l.split(' ')
		//if (tokens.length === 0) continue	// skip blank lines
		if (tokens.length > 2)			// bad format
			err('bad op list')
		if (tokens[0].length === 0) continue

		const ix = [...ltrs].indexOf(tokens[0])	// find letter
		if (ix === -1)				// error if not there
			err('no "' + tokens[0] + '" in grid')
		let len = tokens[1].length - 1		// break into value op
		let op = tokens[1].substr(len,1)
		op = op === 'x' ? '*' : op
		cages[ix].val = Number(tokens[1].substr(0,len))
		cages[ix].op = op as Op
		todo = todo.filter(ltr => ltr !== tokens[0])
	}

	// Done - see if all defined
	todo = todo.filter(c => c !== '0')
	if (todo.length !== 0)
		err(todo.join(',') + ' group(s) undefined')

	// Make promise now
	if (resolve)
		resolve(
			{max, cages} as Puzzle
		)
	else
		reject(err)
})

readPuzzle.then((puzzle) => {
	const {max, cages} = puzzle!
	const solvingBoard = makeSolvingBoard(max, cages)
	const steps = solvingBoard.solve(true)
	if (solvingBoard.noPossibilities() ||
	    !solvingBoard.isSolved()) { //should never happen
		console.log('Failed solve\n' + solvingBoard.toString())
	}
	else {
		console.log('Successful solve:\n' +
			solvingBoard.toString())
		console.log('Difficulty level: ' + (steps-1) + '.')
	}
})
.catch(console.error)
