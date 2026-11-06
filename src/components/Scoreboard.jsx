function PlayerCard({ index, name, score, isSinger, onRename }) {
  return (
    <div className={`scoreboard__player${isSinger ? ' is-singer' : ' is-guesser'}`}>
      <span className="scoreboard__role">{isSinger ? '🎤 Singer' : '🕵️ Guesser'}</span>
      <input
        className="scoreboard__name"
        value={name}
        maxLength={20}
        onChange={(e) => onRename(index, e.target.value)}
        aria-label={`Player ${index + 1} name`}
        spellCheck={false}
      />
      <span className="scoreboard__score" aria-label={`${score} points`}>
        {score}
      </span>
    </div>
  );
}

export default function Scoreboard({ players, scores, singer, round, onRename }) {
  return (
    <section className="scoreboard" aria-label="Scoreboard">
      <PlayerCard index={0} name={players[0]} score={scores[0]} isSinger={singer === 0} onRename={onRename} />
      <div className="scoreboard__round">Round {round}</div>
      <PlayerCard index={1} name={players[1]} score={scores[1]} isSinger={singer === 1} onRename={onRename} />
    </section>
  );
}
