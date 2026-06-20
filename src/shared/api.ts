export type InitResponse = {
  type: 'init';
  postId: string;
  username: string;
};

export type GameStateResponse = {
  type: 'gameState';
  postId: string;
};
