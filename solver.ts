#!/usr/bin/env node
import * as fs from 'fs'
import * as sb from 'structure-bytes'
import {makeSolvingBoard} from './solve'
import {Puzzle, puzzleType, solutionType} from './types'

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
const readSolutions = new Promise<number[]>((resolve, reject) => {
	sb.readValue({
		type: solutionType,
		inStream: fs.createReadStream('solution.sbv')
	}, (err, solution) => {
		if (err) reject(err)
		else resolve(solution!)
	})
})
Promise.all([readPuzzle, readSolutions])
	.then(([puzzle, solution]) => {
		const {max, cages} = puzzle!
		const sol = solution!
		const solvingBoard = makeSolvingBoard(max, cages)
		const steps = solvingBoard.solve(true)
		if (solvingBoard.noPossibilities() ||
		    !solvingBoard.isSolved()) { //should never happen
			console.log('Failed solve\n' + solvingBoard.toString())
		}
		else
			console.log('Successful solve in ' + steps + ' steps')
		if (sol)
			console.log('Solution available')
	})
	.catch(console.error)
