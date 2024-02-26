#!/bin/sh

## Generate a suite of puzzles of some size with some level of difficulty
##
## Usage:  generate k -count m/n -out <file>
##
##   This will generate n puzzles of size kxk of difficulty m randomly.
##   They will be written to an output file if -out specified, otherwise
##   the puzzles are appended to the file /tmp/generate.out.

prog=$0

usage() {
   echo "Usage: ${prog} k -count m/n [-out <file>]" > /dev/tty
   exit 1
}

err() {
   echo "***$*" > /dev/tty
   usage
}

## Parse args
k= count= out=/tmp/generate.out
while [ $# -gt 0 ] ; do
   case "$1" in
   [1-9]*)
      k="$1";;
   -count)
      shift; count="$1";;
   -out)
      shift; out="$1";;
   *)
      usage;;
   esac
   shift
done
[ -n "$k" ] || err "Missing k (puzzle size)"
[ -n "$count" ] || err "Missing -count"

## Run generation program
echo "${count}" |
   awk 'BEGIN{err=""}
   {
      n=split($0,f,"/")
      if (n != 2) {f[1]=0; f[2]=0; err="Malformed -count"}
      for(i=1; i<=n; i++) if (f[i] != "" 0+f[i] "") err="Invalid -count"
      print f[1],f[2],err
   }' |
while read lev num error ; do
   [ -n "${error}" ] && err ${error}
   n=0
   while [ $n -lt $num ] ; do
      ./main.js $k -count ${lev}/1 || break
      files=
      for f in cagings/*/1.sbv ; do
         level=$(echo $f | awk -F/ '{print $2}')
         [ $level -ge $lev ] && ./trans.js $f -id "CS (${level})" >> ${out}
         [ $level -ge $lev ] && files="${files} $f"
      done
      n=$(echo $n $files | awk '{print $1 + NF-1}')
   done
done
