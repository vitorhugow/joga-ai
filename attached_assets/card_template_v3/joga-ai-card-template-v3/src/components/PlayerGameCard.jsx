import './PlayerGameCard.css';
import cardTemplate from '../../assets/card-template-blank.png';

export default function PlayerGameCard({
  name = 'FERREIRA',
  overall = 63,
  position = 'AVA',
  photoUrl = '',
  flagUrl = '',
  clubLogoUrl = '',
  stats = {
    PAC: 68,
    SHO: 72,
    PAS: 65,
    DRI: 70,
    DEF: 40,
    PHY: 65,
  },
  size = 'profile',
}) {
  const orderedStats = [
    ['PAC', stats.PAC ?? 0],
    ['SHO', stats.SHO ?? 0],
    ['PAS', stats.PAS ?? 0],
    ['DRI', stats.DRI ?? 0],
    ['DEF', stats.DEF ?? 0],
    ['PHY', stats.PHY ?? 0],
  ];

  return (
    <div className={`joga-player-card joga-player-card--${size}`} aria-label={`Carta do jogador ${name}`}>
      <img className="joga-card-bg" src={cardTemplate} alt="" />

      <div className="joga-card-photo-slot">
        {photoUrl ? <img src={photoUrl} alt={name} /> : <div className="joga-card-photo-placeholder" />}
      </div>

      <div className="joga-card-rating">
        <span>{overall}</span>
        <small>{position}</small>
      </div>

      {flagUrl ? <img className="joga-card-flag" src={flagUrl} alt="Bandeira" /> : null}
      {clubLogoUrl ? <img className="joga-card-club" src={clubLogoUrl} alt="Equipa" /> : null}

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
