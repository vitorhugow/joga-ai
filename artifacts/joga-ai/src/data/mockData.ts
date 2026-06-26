export const mockData = {
  currentPlayer: {
    id: "1",
    name: "Diogo Ferreira",
    position: "AVA",
    attributes: {
      ritmo: 68,
      finalizacao: 72,
      passe: 65,
      defesa: 40,
      drible: 70,
      fisico: 65,
    },
    shirtNumber: 10,
    title: "Matador",
    seasonStats: {
      matches: 12,
      goals: 8,
      assists: 4,
      saves: 0,
      mvp: 2,
    }
  },
  communities: [
    { id: "1", name: "Os Leões de Lisboa", city: "Lisboa", memberCount: 142, gameType: "fut7", isPrivate: false, isMember: true, coverImage: "https://images.unsplash.com/photo-1579952363873-27f3bade9f55" },
    { id: "2", name: "FC Baixa", city: "Porto", memberCount: 89, gameType: "futsal", isPrivate: true, isMember: false, coverImage: "https://images.unsplash.com/photo-1534158914592-062992fbe900" },
    { id: "3", name: "Sporting Casual", city: "Lisboa", memberCount: 205, gameType: "futebol11", isPrivate: false, isMember: true, coverImage: "https://images.unsplash.com/photo-1551280857-2b9ebf241519" }
  ],
  players: [
    { id: "2", name: "João Silva", position: "DEF", overall: 65, shirtNumber: 4, title: "Muralha" },
    { id: "3", name: "Pedro Santos", position: "MEI", overall: 70, shirtNumber: 8, title: "Maestro" },
    { id: "4", name: "Miguel Costa", position: "GR", overall: 68, shirtNumber: 1, title: "Paredão" },
    { id: "5", name: "Rui Patricio", position: "AVA", overall: 62, shirtNumber: 9, title: "Artilheiro" },
    { id: "6", name: "Bruno Fernandes", position: "MEI", overall: 74, shirtNumber: 18, title: "Criativo" }
  ],
  availableMatches: [
    { id: "1", title: "Peladinha de Sexta", city: "Lisboa", location: "Parque das Nações", gameType: "fut7", level: "recreativo", date: "Sexta, 20:00", spotsRemaining: "3 vagas", price: "5€" },
    { id: "2", title: "Torneio Amador", city: "Porto", location: "Boavista FC", gameType: "futebol11", level: "competitivo", date: "Sábado, 10:00", spotsRemaining: "Lotado", price: "10€" },
    { id: "3", title: "Futsal Noturno", city: "Braga", location: "Pavilhão Municipal", gameType: "futsal", level: "misto", date: "Quinta, 21:30", spotsRemaining: "5 vagas", price: "4€" }
  ],
  liveMatches: [
    { id: "100", title: "Os Leões vs FC Baixa", score: { home: 2, away: 1 }, time: "42:15", events: [
      { id: "e1", type: "golo", player: "Diogo Ferreira", time: "12:00" },
      { id: "e2", type: "cartao_amarelo", player: "João Silva", time: "25:30" },
      { id: "e3", type: "golo", player: "Pedro Santos", time: "38:40" }
    ]}
  ]
};
