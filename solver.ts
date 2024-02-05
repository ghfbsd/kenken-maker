#!/usr/bin/env node
import * as fs from 'fs'
import * as sb from 'structure-bytes'
import {makeSolvingBoard} from './solve'
import {Puzzle, puzzleType} from './types'

const {argv} = process
if (argv.length <= 2) throw new Error('Usage: ./solver.js path/to/cagings.sbv')

const readPuzzle = new Promise<Puzzle>((resolve, reject) => {
	sb.readValue({
		type: puzzleType,
		inStream: fs.createReadStream(argv[2])
	}, (err, value) => {
		if (err) reject(err)
		else resolve(value!)
	})
})
Promise.all([readPuzzle])
	.then(([puzzle]) => {
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
