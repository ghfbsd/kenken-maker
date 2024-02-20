#!/usr/bin/env node
import * as fs from 'fs'
import {promisify} from 'util'
import * as sb from 'structure-bytes'
import {makeBoard, makeCages} from './make-board'
import {makeSolvingBoard} from './solve'
import {Cage, puzzleType, solutionType} from './types'

const SOLUTION_FILE = 'solution.sbv'
const CAGINGS_DIR = 'cagings'

function usageError() {
	throw new Error('Usage: ./main.js boardSize')
}

function badBoard(cages: Cage[]): boolean {
	// Find all = ops
	let LIMIT = 1
	let singles = [...cages].filter(c => c.boxes.length === 1)
	if (singles.length === 0) return (false)

	// Process them
	let ruse: number[] = [...Array(size).keys()].map(() => 0)
	let cuse: number[] = [...Array(size).keys()].map(() => 0)
	for(const cage of singles) {
		let [r, c] = cage.boxes[0]
		ruse[r] += 1; cuse[c] += 1
	}

	// Too many in a row or col?
	const nr = ruse.filter(n => n>LIMIT)
	const nc = cuse.filter(n => n>LIMIT)
	return (nr.length>0 || nc.length>0)
}

const {argv} = process
if (argv.length !== 3) usageError()
const size = Number(argv[2])
if (isNaN(size)) usageError()

const board = makeBoard(size)
sb.writeValue({
	type: solutionType,
	value: ([] as number[]).concat(...board),
	outStream: fs.createWriteStream(SOLUTION_FILE)
}, err => {
	if (err) throw err
	console.log('Saved solution')
	promisify(fs.mkdir)(CAGINGS_DIR)
		.catch(_ =>
			promisify(fs.readdir)(CAGINGS_DIR)
				.then(difficulties => Promise.all(difficulties.map(difficulty => {
					const difficultyDir = CAGINGS_DIR + '/' + difficulty
					return promisify(fs.readdir)(difficultyDir)
						.then(files => Promise.all(files.map(file =>
							promisify(fs.unlink)(difficultyDir + '/' + file)
						)))
						.then(_ => promisify(fs.rmdir)(difficultyDir))
				})))
		)
		.then(makeCaging)
})
const stepsCount: number[] = [] //map of difficulties to count of cagings; key 0 for unsolvable
function makeCaging() {
	let cages: Cage[], steps: number
	let solved = false
	while (!solved) {
		cages = makeCages(board)
		if (badBoard(cages)) continue
		const solvingBoard = makeSolvingBoard(size, cages)
		steps = solvingBoard.solve()
		if (solvingBoard.noPossibilities()) { //should never happen
			console.log('Failed solve\n' + solvingBoard.toString())
		}
		else if (solvingBoard.isSolved()) solved = true
		else stepsCount[0] = (stepsCount[0] || 0) + 1
	}
	stepsCount[steps!] = (stepsCount[steps] || 0) + 1
	logPuzzleCounts()
	const cagingDir = CAGINGS_DIR + '/' + String(steps)
	promisify(fs.mkdir)(cagingDir).catch(_ => {})
		.then(() => new Promise<void>((resolve, reject) =>
			sb.writeValue({
				type: puzzleType,
				value: {max: size, cages},
				outStream: fs.createWriteStream(cagingDir + '/' + String(stepsCount[steps]) + '.sbv')
			}, err => {
				if (err) reject(err)
				else resolve()
			})
		))
		.then(makeCaging)
}
function logPuzzleCounts() {
	const failed = stepsCount[0] || 0
	const succeeded = stepsCount.reduce((a, b) => a + b, 0) - failed
	console.log(
		'Successes:',
		(succeeded / (failed + succeeded) * 100).toFixed(2) + '%;',
		'Counts:',
		stepsCount
			.map((count, steps) => String(steps) + ': ' + String(count))
			.filter(x => x) //take out all steps with no count
			.join(', ')
	)
}
