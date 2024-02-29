#!/usr/bin/env node
import * as fs from 'fs'
import {promisify} from 'util'
import * as sb from 'structure-bytes'
import {makeBoard, makeCages} from './make-board'
import {makeSolvingBoard} from './solve'
import {Cage, puzzleType, solutionType} from './types'

const SOLUTION_FILE = 'solution.sbv'
const CAGINGS_DIR = 'cagings'
let   LINE = 80, LAST = 0

function usageError() {
	Error.stackTraceLimit = 0
	throw new Error('Usage: ' + argv[1].split('/').pop() + ' boardSize' +
		' [-count level/number] [-odo [n]]'
	)
}

function badBoard(cages: Cage[]): boolean {
	// Find all = ops
	let LIMIT = 1
	let singles = [...cages].filter(c => c.boxes.length === 1)
	if (singles.length === 0) return (false)

	// Process them
	let ruse = Array<number>(size).fill(0)
	let cuse = Array<number>(size).fill(0)
	for(const cage of singles) {
		let [r, c] = cage.boxes[0]
		ruse[r] += 1; cuse[c] += 1
	}

	// Too many in a row or col?
	const nr = ruse.filter(n => n>LIMIT)
	const nc = cuse.filter(n => n>LIMIT)
	return (nr.length>0 || nc.length>0)
}

// Parse args
const {argv} = process
let size: number = NaN, lim = Infinity, level = 0
for(let n = 2; n<argv.length; n++) {
	const arg = argv[n]
	const c = arg.substr(0,1)
	if (c !== '-' && isNaN(size)) {
		size = Number(arg)	// set puzzle size
		continue
	}
	if (arg === '-count') {		// set limit on # puzzles
		const levlim = argv[++n].split('/')
		if (levlim.length !== 2) usageError()
		level = Number(levlim[0])
		lim = Number(levlim[1])
		if (isNaN(level) || isNaN(lim)) usageError()
		continue
	}
	if (arg === '-odo') {		// progress odometer
		if (n+1 >= argv.length) {
			LINE = 0
			continue
		}
		let line = Number(argv[n+1])
		if (isNaN(line)) line = 0; else n++
		LINE = line
		continue
	}
	process.stderr.write('***Bad arg: "' + arg + '"\n')
	usageError()
}
if (isNaN(size) || size <= 0 || size > 9) usageError()

const board = makeBoard(size)
const makeCageSize = function(n: number) {
	//Uniform probability among cage sizes 2-4, with decreased
	//  probability of 1 and 5.
	//const MIN_CAGE_SIZE = 1.05, MAX_CAGE_SIZE = 4.55
	//if (n) return () =>
	//	Math.round(MIN_CAGE_SIZE +
	//		Math.random() * (MAX_CAGE_SIZE - MIN_CAGE_SIZE)
	//	)
	//Exponentially decreasing probability for sizes 2-5 for >4x4;
	//   see freq.R for derivation of PDF and breakpoints
	if (n < 4) return () => 2
	let 		N = [0.481, 0.753, 0.942]
	if (n > 4)	N = [0.318, 0.764, 0.947, 0.992]
	return () => {
		const U = Math.random()
		return 1 + N.filter(D => U > D).length
	}
}(size)
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
	let s = 0
	if (stepsCount.slice(level).map(n => s+=n, s).pop()! >= lim) {
		if (LINE) process.stdout.write('\n')
		return
	}
	let cages: Cage[], steps: number
	let solved = false
	while (!solved) {
		cages = makeCages(board, makeCageSize)
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
	if (!LINE) return
	const failed = stepsCount[0] || 0
	const succeeded = stepsCount.reduce((a, b) => a + b, 0) - failed
	let str = 
	//	'Successes: ' +
		(succeeded / (failed + succeeded) * 100).toFixed(2) + '%; ' +
	//	'Counts: ' +
		stepsCount
			.map((count, steps) => String(steps) + ': ' + String(count))
			.filter(x => x) //take out all steps with no count
			.join(', ')
	if (str.length >= LINE) {
		// Don't let progress string get too long; chop off low-rank
		//   solution counts if so.  Always include the % and 0-count
		//   fields, however.
		let sum = 0, len = str.split(', ')
			.map(c => 2 + c.length)
			.map(n => sum += n)
		len.push(len.pop()! - 2)
		const drop = [...len]
			.map(s => str.length - s + len[1] + 1)
		str = str.split(', ')
			.filter((_,i) => drop[i] < LINE || i<1)
			.join(', ')
	}
	const len = str.length
	if (len < LAST) str = ' '.repeat(LAST) + '\r' + str
	process.stdout.write(str + '\r')
	LAST = len
}
