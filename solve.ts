import {Cage, Op} from './types'
import {choose, times, transpose, zip} from './utils'

const MIN_NUMBER = 1
const MAX_ADDITION_SIZE = 4 //maximum number of cells in a '+' or '-' box to consider; any more and the list of possibilities becomes enormous
const MAX_GROUP_SIZE = 4 //maximum number of cells to check for being an isolated group

function allPossibilities(max: number) {
	const possibilities = new Set<number>()
	for (let i = 1; i <= max; i++) possibilities.add(i)
	return possibilities
}

type Solver = (board: SolvingBoard, verbose: boolean) => void

function arithmeticPossibilities(op: Op, val: number, max: number, boxes: number): number[][] {
	if (!boxes) throw new Error('No boxes')
	if (boxes === 1) return (MIN_NUMBER <= val && val <= max) ? [[val]] : [] //should catch =
	const possibilities: number[][] = []
	switch (op) {
		case '+':
			for (let chosen = MIN_NUMBER; chosen <= max && chosen < val; chosen++) {
				possibilities.push(
					...cachedPosibilities(op, val - chosen, max, boxes - 1)
					.map(others => [chosen, ...others])
				)
			}
			break
		case '*':
			for (let chosen = MIN_NUMBER; chosen <= max && chosen <= val; chosen++) {
				const otherProduct = val / chosen
				if (otherProduct !== (otherProduct | 0)) continue
				possibilities.push(
					...cachedPosibilities(op, otherProduct, max, boxes - 1)
					.map(others => [chosen, ...others])
				)
			}
			break
		case '-':
			//Two cases in A - B - C: either this box contains A or it contains either B or C
			//A:
			for (let chosen = val + 1; chosen <= max; chosen++) {
				possibilities.push(
					...cachedPosibilities('+', chosen - val, max, boxes - 1)
					.map(others => [chosen, ...others])
				)
			}
			//B or C:
			for (let chosen = MIN_NUMBER; chosen <= max; chosen++) {
				possibilities.push(
					...cachedPosibilities('-', val + chosen, max, boxes - 1)
					.map(others => [chosen, ...others])
				)
			}
			break
		case '/':
			//Two cases in A / B / C: either this box contains A or it contains either B or C
			//A:
			for (let chosen = val; chosen <= max; chosen++) {
				const otherProduct = chosen / val
				if (otherProduct !== (otherProduct | 0)) continue
				possibilities.push(
					...cachedPosibilities('*', otherProduct, max, boxes - 1)
					.map(others => [chosen, ...others])
				)
			}
			//B or C:
			for (let chosen = MIN_NUMBER; chosen <= max; chosen++) {
				possibilities.push(
					...cachedPosibilities('/', val * chosen, max, boxes - 1)
					.map(others => [chosen, ...others])
				)
			}
			break
		default:
			throw new Error('Unknown op: ' + op)
	}
	return possibilities
}
const arithmeticQueryId = (op: Op, val: number, max: number, boxes: number) =>
	op + [val, max, boxes].join(' ')
const arithmeticResults = new Map<string, number[][]>()
function cachedPosibilities(op: Op, val: number, max: number, boxes: number): number[][] {
	const id = arithmeticQueryId(op, val, max, boxes)
	let possibilities = arithmeticResults.get(id)
	if (!possibilities) {
		possibilities = arithmeticPossibilities(op, val, max, boxes)
		arithmeticResults.set(id, possibilities)
	}
	return possibilities
}

const arithmeticSolver: Solver = (board, verbose) => {
	const {max, cages, rows} = board
	let num = 0
	const prev = board.clone
	for (const cage of cages) {
		const {op, val, boxes} = cage
		if ((op === '+' || op === '-') && boxes.length > MAX_ADDITION_SIZE) continue
		const rowsMustHave = new Map<SolvingRow, Set<number>>()
		for (const box of boxes) {
			for (const row of box.rows) {
				if (!rowsMustHave.has(row)) rowsMustHave.set(row, allPossibilities(max))
			}
		}
		const originalBoxPossibilities = new Map(boxes.map(box => [box, box.possibilities] as [SolvingBox, Set<number>]))
		const boxesPossibilities = boxes.map(_ => new Set<number>())
		possibilityCheck: for (const possibilities of cachedPosibilities(op, val, max, boxes.length)) {
			for (const [box, possibility] of zip(boxes, possibilities)) {
				if (!originalBoxPossibilities.get(box)!.has(possibility)) continue possibilityCheck
				box.value = possibility
			}
			if (rows.some(row => row.conflict)) continue
			const rowsHave = new Map<SolvingRow, Set<number>>()
			for (let i = 0; i < boxes.length; i++) {
				const possibility = possibilities[i]
				boxesPossibilities[i].add(possibility)
				for (const row of boxes[i].rows) {
					let rowHas = rowsHave.get(row)
					if (!rowHas) {
						rowHas = new Set
						rowsHave.set(row, rowHas)
					}
					rowHas.add(possibility)
				}
			}
			for (const [row, mustHaves] of rowsMustHave) {
				for (const mustHave of mustHaves) {
					if (!rowsHave.get(row)!.has(mustHave)) {
						if (mustHaves.delete(mustHave) && !mustHaves.size) {
							rowsMustHave.delete(row)
						}
					}
				}
			}
		}
		for (const [box, boxPossibilities] of zip(boxes, boxesPossibilities)) {
			box.possibilities = originalBoxPossibilities.get(box)!
			box.restrictPossibilities(boxPossibilities)
			num++
		}
		for (const [row, mustHaves] of rowsMustHave) {
			for (const box of row.boxes) {
				if (originalBoxPossibilities.has(box)) continue //skip boxes in this cage
				for (const mustHave of mustHaves) {
					if (!box.hasPossibility(mustHave)) continue
					box.excludePossibility(mustHave)
					num++
				}
			}
		}
	}
	if (verbose && !prev.equals(board))
		console.log('AS: ' + num + ' changes')
}

const pickUniques: Solver = (board, verbose) => {
	let num = 0, prev = board.clone, solved = ''
	for (const row of board.rows) {
		const possibleBoxes = new Map<number, SolvingBox[]>()
		for (const box of row.boxes) {
			for (const possibility of box.possibilities) {
				let boxes = possibleBoxes.get(possibility)
				if (!boxes) {
					boxes = []
					possibleBoxes.set(possibility, boxes)
				}
				boxes.push(box)
			}
		}
		for (const [possibility, boxes] of possibleBoxes) {
			if (boxes.length !== 1) continue
			if (boxes[0].value === possibility) continue
			const [box] = boxes
			box.value = possibility
			solved += ' ' +
				rowID(row) + rowID(box.getOtherRow(row)) +
				'(' + String(possibility) + ')'
			num++
		}
	}
	if (verbose && num > 0) {
		console.log('PU (initial)\n' + prev.toString())
		console.log(
			'... ' + num + ' boxes solved:' + solved + '\n' +
			board.toString()
		)
	}
}

const findIsolatedGroups: Solver = (board, verbose) => {
	const toExclude = new Map<SolvingBox, Set<number>>()
	for (const {boxes} of board.rows) {
		for (let groupSize = 1; groupSize <= MAX_GROUP_SIZE && groupSize < boxes.length; groupSize++) {
			for (const group of choose(boxes, groupSize)) {
				const groupSet = new Set(group)
				const possibilitiesUnion = new Set<number>()
				for (const box of group) { //union all possibilities of boxes
					for (const possibility of box.possibilities) possibilitiesUnion.add(possibility)
				}
				if (possibilitiesUnion.size > groupSize) continue //not an isolated group
				for (const box of boxes) { //remove possibilites from other boxes
					if (groupSet.has(box)) continue
					let toExcludeBox = toExclude.get(box)
					if (!toExcludeBox) {
						toExcludeBox = new Set
						toExclude.set(box, toExcludeBox)
					}
					for (const possibility of possibilitiesUnion) toExcludeBox.add(possibility)
				}
			}
		}
	}
	/**
	 * Exclude possibilities at the end so they cannot be used within the same solve step.
	 * Otherwise, one isolated group could exclude possibilities, forming a new isolated group
	 * that could exclude other possibilities in the same step.
	 */
	let num = 0, prev = board.clone, solved = ''
	for (const [box, possibilities] of toExclude) {
		for (const possibility of possibilities) {
			if (!box.hasPossibility(possibility)) continue
			box.excludePossibility(possibility)
			num++
			solved += ' ' +
				[...box.rows]
				.map(({RC,num}) => RC + String(1+num))
				.join('') + '(' + possibility + ')'
		}
	}
	if (verbose && num > 0) {
		console.log('IG (initial)\n' + prev.toString())
		console.log('... ' + num + ' eliminations:' + solved)
		console.log(board.toString())
	}
}

interface RowAndCrossRows {
	row: SolvingRow
	crossRows: SolvingRow[]
}

function rowID (row: SolvingRow) : string {
	// Printable version of the row or column ID to follow solving algorithm
	let str = row.RC + String(1+row.num)
	//for(const box of row.boxes)       // to verify, if desired
	//	str += '[' + [...box.possibilities].join(' ') + ']'
	return str
}

const crossRowEliminate: Solver = (board, verbose) => {

	let prev = board.clone
	//let initial = true

	for (let value = MIN_NUMBER; value <= board.max; value++) {
		const boxesToExclude = new Set<SolvingBox>()
		for (const direction of board.directionRows) {
			//For each row, find all cells that could have the value
			//and store the crossing rows containing those cells
			const rowCrossRows: RowAndCrossRows[] = []
			for (const row of direction) {
				const crossRows = row.boxes
					.filter(box => box.possibilities.has(value))
					.map(box => box.getOtherRow(row))
				rowCrossRows.push({row, crossRows})
			}
			for (let groupSize = 2; groupSize <= MAX_GROUP_SIZE && groupSize < rowCrossRows.length; groupSize++) {
				for (const rowSet of choose(rowCrossRows, groupSize)) {
					let IDrows = [...rowSet]
					   .map(({row}) => rowID(row)).join(' ')
					const rows = new Set<SolvingRow>()
					const crossRowsUnion = new Set<SolvingRow>()
					let IDcols = ''
					for (const rowCrossRow of rowSet) { //union all cross rows of first groupSize rows
						const {row, crossRows} = rowCrossRow
						rows.add(row)
						for (const crossRow of crossRows) {
							crossRowsUnion.add(crossRow)
							IDcols += ' ' + rowID(crossRow)
						}
					}
					if (crossRowsUnion.size > groupSize) continue //value is not in all of the cross rows
					for (const crossRow of crossRowsUnion) { //remove possibilities from cross rows
						for (const box of crossRow.boxes) {
							if (rows.has(box.getOtherRow(crossRow))) continue //skip boxes in original rows
							if (!box.hasPossibility(value)) continue
							console.log(
					                   'CRE (' +
							   String(value) +
							   '): ' +
							   IDrows + ' vs' +
							   IDcols
							)
							boxesToExclude.add(box)
						}
					}
				}
			}
		}
		//See findIsolatedGroup for an explanation of the delayed exclusions
		for (const box of boxesToExclude) {
			if (!box.hasPossibility(value)) console.log('?!')
			box.excludePossibility(value)
		}
		if (verbose && !prev.equals(board)) {
			console.log('CRE (initial)\n' + prev.toString())
			console.log(
				'... ' + value + ' excluded in ' +
				boxesToExclude.size + ' boxes\n' +
				board.toString()
			)
			prev = board.clone
		}
	}
}
const solvers: Solver[] = [
	arithmeticSolver,
	pickUniques,
	findIsolatedGroups,
	crossRowEliminate
]

class SolvingBox {
	public readonly rows: Set<SolvingRow>

	constructor(public possibilities: Set<number>) {
		this.rows = new Set
	}

	restrictPossibilities(restriction: Set<number>) {
		for (const possibility of this.possibilities) {
			if (!restriction.has(possibility)) this.excludePossibility(possibility)
		}
	}
	hasPossibility(possibility: number) {
		return this.possibilities.has(possibility)
	}
	excludePossibility(possibility: number) {
		this.possibilities.delete(possibility)
	}
	get value(): number | undefined {
		const [first, second] = this.possibilities as Set<number | undefined>
		return (first && !second) ? first : undefined
	}
	set value(value: number | undefined) {
		if (!value) return
		this.possibilities = new Set([value])
	}
	getOtherRow(row: SolvingRow): SolvingRow {
		for (const otherRow of this.rows) {
			if (otherRow !== row) return otherRow
		}
		throw new Error('No other rows?')
	}
}
class SolvingRow { //or column
	constructor(
		public readonly boxes: SolvingBox[],
		public readonly num: number,
		public readonly RC: string
	) {
		for (const {rows} of boxes) rows.add(this)
	}

	get conflict(): boolean {
		const numbers = new Set<number>()
		for (const box of this.boxes) {
			const {value} = box
			if (!value) continue
			if (numbers.has(value)) return true
			numbers.add(value)
		}
		return false
	}
}
class SolvingCage {
	constructor(
		public readonly op: Op,
		public readonly val: number,
		public readonly boxes: SolvingBox[]
	) {}
}
class SolvingBoard {
	constructor(
		public readonly max: number,
		private readonly _rows: SolvingRow[],
		private readonly _columns: SolvingRow[],
		public readonly cages: SolvingCage[]
	) {}

	get rows(): SolvingRow[] { //rows and columns
		return this._rows.concat(this._columns)
	}
	get directionRows(): SolvingRow[][] {
		return [this._rows, this._columns]
	}
	solve(verbose=false): number {
		let rounds = 0
		while (++rounds) {
			const newBoard = this.clone
			for (const solver of solvers) { //solve independent with each solver, starting from current board
				const solverBoard = this.clone
				solver(solverBoard,verbose)
				for (const [box, solvedBox] of zip(newBoard.boxes(), solverBoard.boxes())) {
					box.restrictPossibilities(solvedBox.possibilities) //further restrict newBoard's possibilities from each solver's choices
				}
			}
			if (this.equals(newBoard)) break
			for (const [box, newBox] of zip(this.boxes(), newBoard.boxes())) {
				box.restrictPossibilities(newBox.possibilities)
			}
		}
		return rounds
	}
	*boxes(): Iterable<SolvingBox> {
		for (const {boxes} of this._rows) yield* boxes
	}
	get clone(): SolvingBoard {
		const newBoxes = new Map<SolvingBox, SolvingBox>()
		for (const box of this.boxes()) newBoxes.set(box, new SolvingBox(new Set(box.possibilities)))
		const getNewBoxes = (boxes: SolvingBox[]) => boxes.map(box => newBoxes.get(box)!)
		const getNewRow = ({boxes,num,RC}: SolvingRow) => new SolvingRow(getNewBoxes(boxes),num,RC)
		const newRows = this._rows.map(getNewRow)
		const newColumns = this._columns.map(getNewRow)
		const newCages = this.cages.map(({op, val, boxes}) => new SolvingCage(op, val, getNewBoxes(boxes)))
		return new SolvingBoard(this.max, newRows, newColumns, newCages)
	}
	equals(other: SolvingBoard): boolean { //assumes other's possibilities are a proper subset of this's possibilities
		for (const [box, otherBox] of zip(this.boxes(), other.boxes())) {
			if (otherBox.possibilities.size < box.possibilities.size) return false
		}
		return true
	}
	toString(): string {
		const {max} = this
		const boxOps = new Map<SolvingBox, string>()
		for (const cage of this.cages) {
			const opString = String(cage.val) + cage.op
			for (const box of cage.boxes) boxOps.set(box, opString)
		}
		const possibilityChars = String(max).length
		const possibilitiesPerRow = Math.ceil(Math.sqrt(max / (possibilityChars + 1))) //want possibilitiesPerRow * (possibilityChars + 1) \approx max / possibilitiesPerRow
		const possibilityRows = Math.ceil(max / possibilitiesPerRow)
		const cellWidth = (possibilityChars + 1) * possibilitiesPerRow + 1
		const borderRow = '+' + new Array<string>(max).fill('-'.repeat(cellWidth)).join('+') + '+'
		const rowsStrings = [borderRow]
		for (const row of this._rows) {
			const rowStrings: string[] = new Array<string>(1 + possibilityRows).fill('|')
			for (const cell of row.boxes) {
				rowStrings[0] += ' ' + rightPad(boxOps.get(cell)!, cellWidth - 1) + '|'
				const possibilities = new Set(cell.possibilities)
				for (let i = 0; i < possibilityRows; i++) {
					rowStrings[1 + i] += ' '
					for (let j = 0; j < possibilitiesPerRow; j++) {
						const possibility = i * possibilitiesPerRow + j + 1
						rowStrings[1 + i] += leftPad(possibilities.has(possibility) ? String(possibility) : '', possibilityChars)
						if (j < possibilitiesPerRow - 1) rowStrings[1 + i] += ' '
					}
					rowStrings[1 + i] += ' |'
				}
			}
			rowsStrings.push(...rowStrings, borderRow)
		}
		return rowsStrings.join('\n')
	}
	isSolved(): boolean {
		return this._rows.every(row => row.boxes.every(box => box.possibilities.size === 1))
	}
	noPossibilities(): boolean {
		return this._rows.some(row => row.boxes.some(box => !box.possibilities.size))
	}
}

const leftPad =  (str: string, len: number) => ' '.repeat(Math.max(len - str.length, 0)) + str
const rightPad = (str: string, len: number) => str + ' '.repeat(Math.max(len - str.length, 0))

export function makeSolvingBoard(max: number, cages: Cage[]): SolvingBoard {
	const solvingBoxes = times(() => times(() =>
		new SolvingBox(allPossibilities(max)),
	max), max)
	const rows = solvingBoxes.map((row,i) => new SolvingRow(row,i,'R'))
	const columns = transpose(solvingBoxes).map((row,i) => new SolvingRow(row,i,'C'))
	const solvingCages = cages.map(({op, val, boxes}) =>
		new SolvingCage(op, val, boxes.map(([row, col]) => solvingBoxes[row][col]))
	)
	return new SolvingBoard(max, rows, columns, solvingCages)
}
