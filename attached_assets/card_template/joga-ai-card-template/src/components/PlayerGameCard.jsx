import './PlayerGameCard.css';
import cardTemplate from '../../assets/card-template-blank.png';

export default function PlayerGameCard({
  name = 'VITOR',
  overall = 84,
  position = 'ST',
  photoUrl = '',
  flagUrl = '',
  clubLogoUrl = '',
  stats = {
    PAC: 80,
    SHO: 78,
    PAS: 72,
    DRI: 81,
    DEF: 45,
    PHY: 76,
  },
}) {
  const orderedStats = [
    ['PAC', stats.PAC],
    ['SHO', stats.SHO],
    ['PAS', stats.PAS],
    ['DRI', stats.DRI],
    ['DEF', stats.DEF],
    ['PHY', stats.PHY],
  ];

  return (
    <div className="joga-player-card" aria-label={`Carta do jogador ${name}`}>
      <img className="joga-card-bg" src={cardTemplate} alt="" />

      <div className="joga-card-rating">
        <span>{overall}</span>
        <small>{position}</small>
      </div>

      {flagUrl ? <img className="joga-card-flag" src={flagUrl} alt="Bandeira" /> : null}
      {clubLogoUrl ? <img className="joga-card-club" src={clubLogoUrl} alt="Equipa" /> : null}

      <div className="joga-card-photo-slot">
        {photoUrl ? <img src={photoUrl} alt={name} /> : <div className="joga-card-photo-placeholder" />}
      </div>

      <div className="joga-card-name">{name}</div>

      <div className="joga-card-stats">
        {orderedStats.map(([label, value]) => (
          <div className="joga-card-stat" key={label}>
            <strong>{value}</strong>
            <span>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
