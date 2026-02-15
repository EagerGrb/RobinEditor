
import { PadModel } from '../model/pcb.js';

export class PadController {
  constructor(private model: PadModel) {}

  public setPosition(x: number, y: number): void {
    this.model.position = { x, y };
    this.model.updateTransform();
  }

  public setRotation(rotation: number): void {
    this.model.rotation = rotation;
    this.model.updateTransform();
  }

  public setSize(width: number, height: number): void {
    this.model.size = { w: width, h: height };
    this.model.updateTransform();
  }

  public setLayers(layers: string[]): void {
    this.model.layers = layers;
  }

  public setNetId(netId: string | undefined): void {
    this.model.netId = netId;
  }

  public getModel(): PadModel {
    return this.model;
  }
}
